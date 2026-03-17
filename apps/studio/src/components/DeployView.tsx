import { useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Rocket, Settings, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { engineApi } from '@/api/engine-client';
import { useStudioCommands } from '@/kernel/hooks';

interface DeployRecord {
  deploymentId: string;
  url: string;
  readyState: string;
  createdAt: number;
}

export function DeployView() {
  const [status, setStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [lastDeploy, setLastDeploy] = useState<DeployRecord | null>(null);
  const { recordKernelEvent } = useStudioCommands();

  const handleDeploy = async () => {
    setStatus('deploying');
    setError('');
    try {
      const result = await engineApi.triggerDeploy();
      const record: DeployRecord = {
        deploymentId: String(result.deploymentId ?? ''),
        url: String(result.url ?? ''),
        readyState: String(result.readyState ?? 'QUEUED'),
        createdAt: typeof result.createdAt === 'number' ? result.createdAt : Date.now(),
      };
      setLastDeploy(record);
      setStatus('success');
      recordKernelEvent({
        type: 'resource.changed',
        message: `Deploy triggered: ${record.url}`,
      });
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      setStatus('error');
      recordKernelEvent({
        type: 'resource.changed',
        message: `Deploy failed: ${message}`,
      });
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Rocket className="size-4" />
            <div>
              <h1 className="text-lg font-semibold">Vercel Deploy</h1>
              <p className="text-sm text-muted-foreground">
                将当前项目部署到 Vercel。需要配置 VERCEL_TOKEN 环境变量。
              </p>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm">
              <Settings className="size-4 text-muted-foreground" />
              <span className="font-medium">部署状态</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              {status === 'idle' && !lastDeploy ? (
                <span className="text-muted-foreground">未部署 — 点击下方按钮触发首次部署。</span>
              ) : null}
              {status === 'deploying' ? (
                <>
                  <Loader2 className="size-4 animate-spin text-blue-500" />
                  <span className="text-blue-600">正在触发部署...</span>
                </>
              ) : null}
              {status === 'success' ? (
                <>
                  <CheckCircle2 className="size-4 text-green-500" />
                  <span className="text-green-600">部署已触发</span>
                </>
              ) : null}
              {status === 'error' ? (
                <>
                  <XCircle className="size-4 text-destructive" />
                  <span className="text-destructive">{error}</span>
                </>
              ) : null}
            </div>
          </div>

          {lastDeploy && (
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">最近部署</span>
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase">
                  {lastDeploy.readyState}
                </span>
              </div>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">ID</span>
                  <span className="truncate font-mono text-xs">{lastDeploy.deploymentId}</span>
                </div>
                {lastDeploy.url && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">URL</span>
                    <a
                      href={lastDeploy.url.startsWith('http') ? lastDeploy.url : `https://${lastDeploy.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 truncate text-xs text-blue-600 hover:underline"
                    >
                      {lastDeploy.url}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">时间</span>
                  <span className="text-xs">{new Date(lastDeploy.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <EmptyState
            icon={Settings}
            message="配置说明"
            description={
              <ol className="mt-1 list-inside list-decimal space-y-1 text-left">
                <li>在 Vercel 控制台创建 Deploy Token</li>
                <li>设置环境变量 VERCEL_TOKEN、VERCEL_PROJECT_ID</li>
                <li>可选设置 VERCEL_TEAM_ID（团队项目）</li>
                <li>重启 Engine 后即可使用部署功能</li>
              </ol>
            }
          />

          <div className="flex gap-2">
            <Button
              disabled={status === 'deploying'}
              onClick={() => void handleDeploy()}
            >
              {status === 'deploying' ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Rocket className="mr-1 size-4" />
              )}
              {status === 'deploying' ? '部署中...' : '触发部署'}
            </Button>
            {lastDeploy && status !== 'deploying' && (
              <Button variant="outline" onClick={() => void handleDeploy()}>
                <RefreshCw className="mr-1 size-4" />
                重新部署
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
