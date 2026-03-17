import { useState } from 'react';
import { CheckCircle2, Loader2, Rocket, Settings, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { engineApi } from '@/api/engine-client';
import { useStudioCommands } from '@/kernel/hooks';

export function DeployView() {
  const [status, setStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const { recordKernelEvent } = useStudioCommands();

  const handleDeploy = async () => {
    setStatus('deploying');
    setError('');
    try {
      await engineApi.triggerDeploy();
      setStatus('success');
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
              {status === 'idle' ? (
                <span className="text-muted-foreground">未配置 — 请设置 VERCEL_TOKEN 环境变量以启用部署。</span>
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

          <EmptyState
            icon={Settings}
            message="配置说明"
            description={
              <ol className="mt-1 list-inside list-decimal space-y-1 text-left">
                <li>在 Vercel 控制台创建 Deploy Token</li>
                <li>在项目 .kal/config.env 中设置 VERCEL_TOKEN=your_token</li>
                <li>重启 Engine 后即可使用部署功能</li>
              </ol>
            }
          />

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
        </section>
      </div>
    </div>
  );
}
