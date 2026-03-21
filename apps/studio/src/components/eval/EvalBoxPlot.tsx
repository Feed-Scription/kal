import type { EvalNumericStats } from '@/types/project';

const COLOR_A = 'var(--chart-1)';
const COLOR_B = 'var(--chart-2)';

const BAR_H = 10;
const SVG_H = BAR_H;
const MIN_LABEL_GAP = 40;

export function EvalBoxPlot({
  label,
  a,
  b,
  format = 'number',
}: {
  label: string;
  a: EvalNumericStats;
  b: EvalNumericStats;
  format?: 'number' | 'currency' | 'ms';
}) {
  const globalMin = Math.min(a.min, b.min);
  const globalMax = Math.max(a.max, b.max);
  const range = globalMax - globalMin || 1;

  const pct = (v: number) => ((v - globalMin) / range) * 100;

  const fmt = (v: number) => {
    if (format === 'currency') {
      if (v === 0) return '$0';
      // Ensure at least 1 significant digit: $0.00012 → "$0.00012", $1.23 → "$1.230"
      const digits = v !== 0 && Math.abs(v) < 0.001
        ? Math.max(4, -Math.floor(Math.log10(Math.abs(v))) + 1)
        : 4;
      return `$${v.toFixed(digits)}`;
    }
    if (format === 'ms') return `${v.toFixed(0)}ms`;
    return v.toFixed(2);
  };

  const renderBar = (stats: EvalNumericStats, color: string, rowLabel: string) => {
    const pMin = pct(stats.min);
    const pMax = pct(stats.max);
    const p25 = pct(stats.p25);
    const p75 = pct(stats.p75);
    const pMed = pct(stats.median);
    const boxW = Math.max(p75 - p25, 0.8);

    // Approximate pixel positions for label collision (assume ~300px chart width)
    const approxW = 300;
    const xMin = (pMin / 100) * approxW;
    const xMed = (pMed / 100) * approxW;
    const xMax = (pMax / 100) * approxW;
    const showMin = Math.abs(xMed - xMin) > MIN_LABEL_GAP;
    const showMax = Math.abs(xMax - xMed) > MIN_LABEL_GAP;

    return (
      <div className="flex items-center gap-2">
        <span className="w-3 shrink-0 text-xs text-muted-foreground">{rowLabel}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Value labels */}
          <div className="relative h-3.5">
            {showMin && (
              <span
                className="absolute text-[10px] tabular-nums text-muted-foreground"
                style={{ left: `${pMin}%`, transform: 'translateX(0)' }}
              >
                {fmt(stats.min)}
              </span>
            )}
            <span
              className="absolute text-[10px] font-medium tabular-nums"
              style={{ left: `${pMed}%`, transform: 'translateX(-50%)', color }}
            >
              {fmt(stats.median)}
            </span>
            {showMax && (
              <span
                className="absolute right-0 text-[10px] tabular-nums text-muted-foreground"
                style={{ right: `${100 - pMax}%`, transform: 'translateX(0)', textAlign: 'right' }}
              >
                {fmt(stats.max)}
              </span>
            )}
          </div>
          {/* SVG bar */}
          <svg width="100%" height={SVG_H} preserveAspectRatio="none">
            {/* Whisker */}
            <line x1={`${pMin}%`} x2={`${pMax}%`} y1={SVG_H / 2} y2={SVG_H / 2} stroke={color} strokeWidth={1} strokeOpacity={0.4} />
            {/* Caps */}
            <line x1={`${pMin}%`} x2={`${pMin}%`} y1={1} y2={SVG_H - 1} stroke={color} strokeWidth={1} />
            <line x1={`${pMax}%`} x2={`${pMax}%`} y1={1} y2={SVG_H - 1} stroke={color} strokeWidth={1} />
            {/* IQR box */}
            <rect x={`${p25}%`} y={0} width={`${boxW}%`} height={SVG_H} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1} rx={2} />
            {/* Median */}
            <line x1={`${pMed}%`} x2={`${pMed}%`} y1={1} y2={SVG_H - 1} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {renderBar(a, COLOR_A, 'A')}
      {renderBar(b, COLOR_B, 'B')}
    </div>
  );
}
