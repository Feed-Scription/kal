import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function EvalDeltaCard({
  label,
  a,
  b,
  delta,
  pctChange,
  format = 'number',
  lowerIsBetter = true,
}: {
  label: string;
  a: number;
  b: number;
  delta: number;
  pctChange: number | null;
  format?: 'number' | 'currency' | 'ms';
  lowerIsBetter?: boolean;
}) {
  const { t } = useTranslation('eval');
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const isNeutral = delta === 0;

  const fmt = (v: number) => {
    if (format === 'currency') {
      if (v === 0) return '$0';
      const digits = v !== 0 && Math.abs(v) < 0.001
        ? Math.max(4, -Math.floor(Math.log10(Math.abs(v))) + 1)
        : 4;
      return `$${v.toFixed(digits)}`;
    }
    if (format === 'ms') return `${v.toFixed(0)}ms`;
    return v.toFixed(2);
  };

  const Icon = isNeutral ? Minus : improved ? TrendingDown : TrendingUp;
  const accentClass = isNeutral
    ? 'text-muted-foreground'
    : improved
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-destructive';

  return (
    <div className={cn(
      'flex items-center justify-between rounded-lg border px-3 py-2.5',
      !isNeutral && improved && 'border-emerald-500/20 bg-emerald-500/5',
      !isNeutral && !improved && 'border-destructive/20 bg-destructive/5',
    )}>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-sm font-medium tabular-nums">{fmt(a)}</span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className="text-sm font-medium tabular-nums">{fmt(b)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Icon className={cn('size-4', accentClass)} />
        {pctChange !== null && !isNeutral && (
          <Badge
            variant="outline"
            className={cn(
              'tabular-nums text-[10px]',
              improved ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-destructive/30 text-destructive',
            )}
          >
            {delta > 0 ? '+' : ''}{t('delta.pctChange', { value: pctChange.toFixed(1) })}
          </Badge>
        )}
      </div>
    </div>
  );
}
