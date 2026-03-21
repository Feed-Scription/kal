import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { EvalDeltaCard } from './EvalDeltaCard';
import { EvalBoxPlot } from './EvalBoxPlot';
import { EvalBooleanBar } from './EvalBooleanBar';
import { EvalOutputComparison } from './EvalOutputComparison';
import type { EvalRunResult, EvalComparisonResult } from '@/types/project';

export function EvalResultsSection({
  resultA,
  resultB,
  comparison,
}: {
  resultA: EvalRunResult | null;
  resultB: EvalRunResult | null;
  comparison: EvalComparisonResult | null;
}) {
  const { t } = useTranslation('eval');

  if (!resultA && !resultB) return null;

  const hasComparison = comparison !== null;
  const diff = comparison?.diff;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      {/* Section title */}
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">
          {hasComparison ? t('compareTitle') : t('resultA')}
        </span>
        {resultA && (
          <span className="text-xs text-muted-foreground">
            {resultA.model ?? t('resultModelDefault')} · {t('resultRuns', { count: resultA.runs })}
          </span>
        )}
      </div>

      {/* Summary delta cards */}
      {hasComparison && diff && (
        <div className="grid gap-2 md:grid-cols-2">
          {diff.cost && (
            <EvalDeltaCard
              label={t('delta.cost')}
              a={diff.cost.a}
              b={diff.cost.b}
              delta={diff.cost.delta}
              pctChange={diff.cost.pctChange}
              format="currency"
              lowerIsBetter
            />
          )}
          {diff.avgLatency && (
            <EvalDeltaCard
              label={t('delta.latency')}
              a={diff.avgLatency.a}
              b={diff.avgLatency.b}
              delta={diff.avgLatency.delta}
              pctChange={diff.avgLatency.pctChange}
              format="ms"
              lowerIsBetter
            />
          )}
        </div>
      )}

      {/* Box plots for numeric stats */}
      {hasComparison && diff?.numericStats && Object.keys(diff.numericStats).length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">{t('results.distributionTitle')}</div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(diff.numericStats).map(([key]) => {
              const statsA = resultA?.result.numericStats[key];
              const statsB = resultB?.result.numericStats[key];
              if (!statsA || !statsB) return null;
              const format = key.toLowerCase().includes('cost') ? 'currency' as const
                : key.toLowerCase().includes('latency') ? 'ms' as const
                : 'number' as const;
              return (
                <EvalBoxPlot
                  key={key}
                  label={key}
                  a={statsA}
                  b={statsB}
                  format={format}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Boolean bars */}
      {hasComparison && diff?.booleanStats && Object.keys(diff.booleanStats).length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">{t('results.booleanTitle')}</div>
          <div className="space-y-3">
            {Object.entries(diff.booleanStats).map(([key]) => {
              const statsA = resultA?.result.booleanStats?.[key];
              const statsB = resultB?.result.booleanStats?.[key];
              if (!statsA || !statsB) return null;
              return (
                <EvalBooleanBar key={key} label={key} a={statsA} b={statsB} />
              );
            })}
          </div>
        </div>
      )}

      {/* Single-result stats (no comparison yet) */}
      {!hasComparison && (resultA || resultB) && (() => {
        const result = resultA ?? resultB!;
        return (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('metrics.cost')}</div>
              <div className="mt-1 text-sm font-medium tabular-nums">${result.result.cost}</div>
            </div>
            <div className="rounded-lg border px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('metrics.latency')}</div>
              <div className="mt-1 text-sm font-medium tabular-nums">{result.result.avgLatency}ms</div>
            </div>
          </div>
        );
      })()}

      {/* Output comparison */}
      {resultA && (
        <EvalOutputComparison
          perRunA={resultA.result.perRun}
          perRunB={resultB?.result.perRun}
        />
      )}
    </section>
  );
}
