/**
 * Shared state diff entry card.
 *
 * Used by DebuggerView, StateDiffPanel, and future DebugStreamSidebar.
 */
import { useTranslation } from 'react-i18next';
import type { StateDiffEntry } from '@/types/project';

function formatValue(value: unknown) {
  if (value === undefined) return '—';
  return JSON.stringify(value, null, 2);
}

type StateDiffCardProps = {
  entry: StateDiffEntry;
  /** Compact mode uses smaller layout */
  compact?: boolean;
};

export function StateDiffCard({ entry, compact }: StateDiffCardProps) {
  const { t } = useTranslation('debug');

  return (
    <div className={`rounded-lg border px-3 py-2 ${compact ? 'text-sm' : 'text-xs'}`}>
      <div className="font-medium">{entry.key}</div>
      <div className="mt-1 grid gap-2 md:grid-cols-2">
        <div className="rounded bg-muted/40 p-2">
          {!compact && <div className="mb-1 text-muted-foreground">{t('stateDiff.before').toLowerCase()}</div>}
          <pre className="whitespace-pre-wrap break-all">{formatValue(entry.before)}</pre>
        </div>
        <div className="rounded bg-muted/40 p-2">
          {!compact && <div className="mb-1 text-muted-foreground">{t('stateDiff.after').toLowerCase()}</div>}
          <pre className="whitespace-pre-wrap break-all">{formatValue(entry.after)}</pre>
        </div>
      </div>
    </div>
  );
}
