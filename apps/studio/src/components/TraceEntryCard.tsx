/**
 * Shared timeline trace entry card.
 *
 * Used by TracePanel, DebugStreamSidebar, and other debug views.
 */
import { useTranslation } from 'react-i18next';
import { formatTimeFromTimestamp } from '@/i18n/format';
import { cn } from '@/lib/utils';
import type { TraceTimelineEntry } from '@/types/project';

type TraceEntryCardProps = {
  entry: TraceTimelineEntry;
  /** Compact mode hides detail text */
  compact?: boolean;
  /** Whether this card is highlighted (e.g. hover from sidebar) */
  highlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
};

export function TraceEntryCard({ entry, compact, highlighted, onMouseEnter, onMouseLeave, onClick }: TraceEntryCardProps) {
  const { t } = useTranslation('debug');

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-sm transition-colors',
        entry.eventType === 'run.breakpoint' && 'border-amber-400 bg-amber-50/60',
        highlighted && 'ring-2 ring-primary/50 bg-primary/5',
        onClick && 'cursor-pointer hover:bg-muted/50',
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{entry.title}</div>
        <div className="text-xs text-muted-foreground">{formatTimeFromTimestamp(entry.timestamp)}</div>
      </div>
      <div className="text-xs text-muted-foreground">
        {entry.eventType} · {entry.cursorStepId ?? '—'}
        {!compact && entry.status ? ` · ${t(`runStatusLabel.${entry.status}`)}` : ''}
      </div>
      {entry.detail && !compact ? <div className="mt-1 text-xs">{entry.detail}</div> : null}
      {entry.changedKeys.length > 0 ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {t('trace.changedPrefix')} {entry.changedKeys.slice(0, 4).join(', ')}
        </div>
      ) : null}
    </div>
  );
}
