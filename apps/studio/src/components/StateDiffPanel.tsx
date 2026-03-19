import { SplitSquareVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { StateDiffCard } from '@/components/StateDiffCard';
import { useRunDebug, useStudioCommands } from '@/kernel/hooks';

export function StateDiffPanel() {
  const { t } = useTranslation('debug');
  const { selectedRun, selectedStateDiff } = useRunDebug();
  const { setActiveView } = useStudioCommands();
  const preview = selectedStateDiff.slice(0, 8);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SplitSquareVertical className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">{t('stateDiff.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('stateDiff.subtitle')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveView('kal.debugger')}>
          {t('stateDiff.debugDetails')}
        </Button>
      </div>

      {!selectedRun ? (
        <EmptyState message={t('stateDiff.noSelectedRun')} compact />
      ) : preview.length === 0 ? (
        <EmptyState message={t('stateDiff.noStateDiff')} compact />
      ) : (
        <div className="space-y-2">
          {preview.map((entry) => (
            <StateDiffCard key={entry.key} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
