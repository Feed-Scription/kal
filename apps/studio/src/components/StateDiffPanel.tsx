import { SplitSquareVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRunDebug, useStudioCommands } from '@/kernel/hooks';

function formatValue(value: unknown) {
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value);
}

export function StateDiffPanel() {
  const { selectedRun, selectedStateDiff } = useRunDebug();
  const { setActiveView } = useStudioCommands();
  const preview = selectedStateDiff.slice(0, 8);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SplitSquareVertical className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">State Diff</h3>
            <p className="text-xs text-muted-foreground">展示 selected run 的 state changes。</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveView('kal.debugger')}>
          调试详情
        </Button>
      </div>

      {!selectedRun ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          当前没有选中的 run。
        </div>
      ) : preview.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          当前 run 没有 state diff。
        </div>
      ) : (
        <div className="space-y-2">
          {preview.map((entry) => (
            <div key={entry.key} className="rounded-lg border px-3 py-2 text-sm">
              <div className="font-medium">{entry.key}</div>
              <div className="mt-1 grid gap-2 text-xs md:grid-cols-2">
                <div className="rounded bg-muted/40 p-2">
                  <div className="mb-1 text-muted-foreground">before</div>
                  <pre className="whitespace-pre-wrap break-all">{formatValue(entry.before)}</pre>
                </div>
                <div className="rounded bg-muted/40 p-2">
                  <div className="mb-1 text-muted-foreground">after</div>
                  <pre className="whitespace-pre-wrap break-all">{formatValue(entry.after)}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
