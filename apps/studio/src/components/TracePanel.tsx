import { ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/EmptyState';
import { TraceEntryCard } from '@/components/TraceEntryCard';
import { useRunDebug } from '@/kernel/hooks';

export function TracePanel() {
  const { t } = useTranslation('debug');
  const { breakpoints, selectedRun, selectedTimeline } = useRunDebug();
  const preview = selectedTimeline.slice(0, 6);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
          <ScrollText className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">{t('trace.panelTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('trace.panelSubtitle')}</p>
          </div>
      </div>

      {!selectedRun ? (
        <EmptyState message={t('trace.noSelectedRun')} compact />
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {selectedRun.run_id} · {t(`runStatusLabel.${selectedRun.status}`)} · {t('stream.footerEvents', { count: selectedTimeline.length })} · {t('stream.footerBreakpoints', { count: breakpoints.length })}
          </div>
          <div className="space-y-2">
            {preview.map((entry) => (
              <TraceEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
