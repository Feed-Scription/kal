import { Activity, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/EmptyState';
import { useKernelEvents, useKernelJobs } from '@/kernel/hooks';
import { formatTimeFromTimestamp } from '@/i18n/format';

export function EventLogPanel() {
  const { t } = useTranslation('workbench');
  const jobs = useKernelJobs();
  const events = useKernelEvents(16);
  const activeJobs = jobs.filter((job) => job.status === 'running');

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Activity className="size-4" />
        {t('eventLog.title')}
      </div>

      <div className="mt-3 space-y-4">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Jobs
          </div>
          {jobs.length === 0 ? (
            <EmptyState message={t('eventLog.noJobs')} compact />
          ) : (
            jobs.slice(0, 4).map((job) => (
              <div key={job.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{job.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {job.detail ?? t('eventLog.noDetail')}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div className="flex items-center justify-end gap-1">
                      {job.status === 'running' ? <Loader2 className="size-3 animate-spin" /> : null}
                      <span>{job.status}</span>
                    </div>
                    <div>{job.progress}%</div>
                  </div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      job.status === 'failed'
                        ? 'bg-destructive'
                        : job.status === 'completed'
                          ? 'bg-green-600'
                          : 'bg-primary'
                    }`}
                    style={{ width: `${Math.max(job.progress, 4)}%` }}
                  />
                </div>
              </div>
            ))
          )}
          <div className="text-xs text-muted-foreground">
            {t('eventLog.activeJobs', { count: activeJobs.length })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Recent Events
          </div>
          {events.length === 0 ? (
            <EmptyState message={t('eventLog.noKernelEvents')} compact />
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="rounded-lg border p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{event.type}</div>
                    <div className="text-muted-foreground">{formatTimeFromTimestamp(event.timestamp)}</div>
                  </div>
                  <div className="mt-1 text-sm">{event.message}</div>
                  <div className="mt-1 text-muted-foreground">
                    {[event.resourceId, event.runId, event.extensionId].filter(Boolean).join(' · ') || 'kernel'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
