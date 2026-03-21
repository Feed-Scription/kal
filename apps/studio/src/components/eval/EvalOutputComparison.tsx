import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EvalPerRunResult } from '@/types/project';

export function EvalOutputComparison({
  perRunA,
  perRunB,
}: {
  perRunA: EvalPerRunResult[];
  perRunB?: EvalPerRunResult[];
}) {
  const { t } = useTranslation('eval');
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const maxRuns = Math.max(perRunA.length, perRunB?.length ?? 0);
  const visibleCount = showAll ? maxRuns : Math.min(5, maxRuns);
  const hasBoth = perRunB && perRunB.length > 0;

  const toggleRow = (i: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const formatOutput = (val: unknown) => {
    if (typeof val === 'string') return val;
    return JSON.stringify(val, null, 2);
  };

  const truncate = (val: unknown, limit = 80) => {
    const s = formatOutput(val);
    if (s.length <= limit) return s;
    return s.slice(0, limit) + '…';
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {t('results.outputsTitle')}
        <span className="text-muted-foreground/60">({maxRuns})</span>
      </button>

      {expanded && (
        <div className="overflow-auto rounded-lg border">
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="w-8 px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                <th className="px-2 py-1.5 text-left font-medium">{t('results.outputA')}</th>
                {hasBoth && <th className="px-2 py-1.5 text-left font-medium">{t('results.outputB')}</th>}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: visibleCount }, (_, i) => {
                const isRowExpanded = expandedRows.has(i);
                const outA = perRunA[i]?.output;
                const outB = perRunB?.[i]?.output;
                const fullA = formatOutput(outA);
                const fullB = formatOutput(outB);
                const isLong = fullA.length > 80 || (hasBoth && fullB.length > 80);
                return (
                  <tr
                    key={i}
                    className={cn(
                      'border-b last:border-b-0 transition-colors',
                      i % 2 === 1 && 'bg-muted/20',
                      isLong && !isRowExpanded && 'cursor-pointer hover:bg-muted/40',
                    )}
                    onClick={isLong ? () => toggleRow(i) : undefined}
                  >
                    <td className="px-2 py-1.5 align-top text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-2 py-1.5 align-top">
                      <pre className="whitespace-pre-wrap font-mono leading-relaxed">
                        {isRowExpanded ? fullA : truncate(outA)}
                      </pre>
                      {isLong && !isRowExpanded && (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-primary/60">
                          <ChevronsUpDown className="size-2.5" />
                        </span>
                      )}
                    </td>
                    {hasBoth && (
                      <td className="border-l px-2 py-1.5 align-top">
                        <pre className="whitespace-pre-wrap font-mono leading-relaxed">
                          {isRowExpanded ? fullB : truncate(outB)}
                        </pre>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {maxRuns > 5 && (
            <div className="border-t bg-muted/20 px-2 py-1.5 text-center">
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowAll(!showAll)}>
                {showAll ? t('results.collapse') : `${t('results.showAll')} (${maxRuns})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
