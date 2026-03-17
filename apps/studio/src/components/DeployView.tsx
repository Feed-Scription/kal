import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Rocket, Settings, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { engineApi } from '@/api/engine-client';
import { useStudioCommands } from '@/kernel/hooks';
import { formatDateTime } from '@/i18n/format';

interface DeployRecord {
  deploymentId: string;
  url: string;
  readyState: string;
  createdAt: number;
}

export function DeployView() {
  const { t } = useTranslation('deploy');
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
              <h1 className="text-lg font-semibold">{t('vercelDeploy')}</h1>
              <p className="text-sm text-muted-foreground">
                {t('subtitle')}
              </p>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm">
              <Settings className="size-4 text-muted-foreground" />
              <span className="font-medium">{t('deployStatus')}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              {status === 'idle' && !lastDeploy ? (
                <span className="text-muted-foreground">{t('notDeployed')}</span>
              ) : null}
              {status === 'deploying' ? (
                <>
                  <Loader2 className="size-4 animate-spin text-blue-500" />
                  <span className="text-blue-600">{t('triggeringDeploy')}</span>
                </>
              ) : null}
              {status === 'success' ? (
                <>
                  <CheckCircle2 className="size-4 text-green-500" />
                  <span className="text-green-600">{t('deployTriggered')}</span>
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
                <span className="text-sm font-medium">{t('lastDeploy')}</span>
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
                  <span className="text-muted-foreground">{t('time')}</span>
                  <span className="text-xs">{formatDateTime(lastDeploy.createdAt)}</span>
                </div>
              </div>
            </div>
          )}

          <EmptyState
            icon={Settings}
            message={t('configInstructions')}
            description={
              <ol className="mt-1 list-inside list-decimal space-y-1 text-left">
                <li>{t('configStep1')}</li>
                <li>{t('configStep2')}</li>
                <li>{t('configStep3')}</li>
                <li>{t('configStep4')}</li>
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
              {status === 'deploying' ? t('deploying') : t('triggerDeploy')}
            </Button>
            {lastDeploy && status !== 'deploying' && (
              <Button variant="outline" onClick={() => void handleDeploy()}>
                <RefreshCw className="mr-1 size-4" />
                {t('redeploy')}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
