import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRunDebug, useStudioCommands } from '@/kernel/hooks';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

export function TracePanel() {
  const { breakpoints, selectedRun, selectedTimeline } = useRunDebug();
  const { setActiveView } = useStudioCommands();
  const preview = selectedTimeline.slice(0, 6);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScrollText className="size-4" />
          <div>
            <h3 className="text-sm font-semibold">Trace Panel</h3>
            <p className="text-xs text-muted-foreground">围绕 selected run 展示统一 timeline。</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveView('kal.debugger')}>
          打开调试器
        </Button>
      </div>

      {!selectedRun ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          当前没有选中的 run。
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {selectedRun.run_id} · {selectedRun.status} · {selectedTimeline.length} timeline entries · {breakpoints.length} breakpoints
          </div>
          <div className="space-y-2">
            {preview.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  entry.eventType === 'run.breakpoint' ? 'border-amber-400 bg-amber-50/60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{entry.title}</div>
                  <div className="text-xs text-muted-foreground">{formatTime(entry.timestamp)}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.eventType} · {entry.cursorStepId ?? 'null'} · {entry.status}
                </div>
                {entry.detail ? <div className="mt-1 text-xs">{entry.detail}</div> : null}
                {entry.changedKeys.length > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    changed: {entry.changedKeys.slice(0, 4).join(', ')}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
