import { useState } from 'react';
import { Rocket, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { engineApi } from '@/api/engine-client';
import { useStudioCommands } from '@/kernel/hooks';

export function DeployView() {
  const [status, setStatus] = useState<'idle' | 'deploying' | 'error'>('idle');
  const [error, setError] = useState('');
  const { recordKernelEvent } = useStudioCommands();

  const handleDeploy = async () => {
    setStatus('deploying');
    setError('');
    try {
      await engineApi.triggerDeploy();
      setStatus('idle');
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
            <div className="mt-2 text-sm text-muted-foreground">
              {status === 'idle' && !error ? '未配置 — 请设置 VERCEL_TOKEN 环境变量以启用部署。' : null}
              {status === 'deploying' ? '正在触发部署...' : null}
              {status === 'error' ? (
                <span className="text-destructive">{error}</span>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <div className="font-medium">配置说明</div>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>在 Vercel 控制台创建 Deploy Token</li>
              <li>在项目 .kal/config.env 中设置 VERCEL_TOKEN=your_token</li>
              <li>重启 Engine 后即可使用部署功能</li>
            </ol>
          </div>

          <Button
            disabled={status === 'deploying'}
            onClick={() => void handleDeploy()}
          >
            <Rocket className="mr-1 size-4" />
            {status === 'deploying' ? '部署中...' : '触发部署'}
          </Button>
        </section>
      </div>
    </div>
  );
}
