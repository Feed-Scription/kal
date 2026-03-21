import type { EvalBooleanStats } from '@/types/project';

export function EvalBooleanBar({
  label,
  a,
  b,
}: {
  label: string;
  a: EvalBooleanStats;
  b: EvalBooleanStats;
}) {
  const renderBar = (stats: EvalBooleanStats, rowLabel: string) => {
    const pct = (stats.trueRate * 100).toFixed(1);
    return (
      <div className="flex items-center gap-2">
        <span className="w-4 text-[10px] text-muted-foreground">{rowLabel}</span>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${stats.trueRate * 100}%` }}
          />
        </div>
        <span className="w-12 text-right text-xs font-medium">{pct}%</span>
      </div>
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {renderBar(a, 'A')}
      {renderBar(b, 'B')}
    </div>
  );
}
