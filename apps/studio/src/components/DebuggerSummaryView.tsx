import { useEffect } from "react";
import { Bug } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { EmptyState } from "@/components/EmptyState";
import { useRunDebug, useStudioCommands } from "@/kernel/hooks";
import { cn } from "@/lib/utils";
import { formatTimeFromTimestamp } from '@/i18n/format';
import { getRunStatusConfig } from '@/utils/run-status';

export function DebuggerSummaryView() {
  const { t } = useTranslation('debug');
  const { breakpoints, runs } = useRunDebug();
  const { refreshRuns, selectRun } = useStudioCommands();

  useEffect(() => {
    void refreshRuns().then((items) => {
      const activeRun = items.find((run) => run.active) ?? items[0] ?? null;
      if (activeRun) {
        void selectRun(activeRun.run_id).catch(() => {});
      }
    }).catch(() => {});
  }, [refreshRuns, selectRun]);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
          <Bug className="size-4" />
          {t('summary.title')}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('summary.activeBreakpoints')}</span>
          <span className="font-medium">{breakpoints.length}</span>
        </div>
        {runs.length === 0 ? (
          <EmptyState
            icon={Bug}
            message={t('summary.noActiveRun')}
            description={t('summary.noActiveRunDescription')}
            compact
          />
        ) : (
          runs.slice(0, 4).map((record) => {
            const config = getRunStatusConfig(record.run.status);
            const Icon = config.icon;

            return (
              <button
                key={record.runId}
                type="button"
                onClick={() => void selectRun(record.runId)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                  record.run.active && "ring-2 ring-primary",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn("rounded-full p-1", config.bg)}>
                    <Icon className={cn("size-3", config.color)} />
                  </div>
                  <div className="flex-1 truncate font-medium">{record.run.run_id}</div>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={config.color}>{t(`runStatusLabel.${record.run.status}`)}</span>
                  <span>·</span>
                  <span>{formatTimeFromTimestamp(record.run.updated_at)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
