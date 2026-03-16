import { useEffect } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunDebug, useStudioCommands } from "@/kernel/hooks";

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
}

export function DebuggerSummaryView() {
  const { runs } = useRunDebug();
  const { refreshRuns, selectRun, setActiveView } = useStudioCommands();

  useEffect(() => {
    void refreshRuns().then((items) => {
      const activeRun = items.find((run) => run.active) ?? items[0] ?? null;
      if (activeRun) {
        void selectRun(activeRun.run_id).catch(() => {});
      }
    }).catch(() => {});
  }, [refreshRuns, selectRun]);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bug className="size-4" />
          Debug Summary
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveView("kal.debugger")}>
          打开调试器
        </Button>
      </div>

      <div className="space-y-2 text-sm">
        {runs.length === 0 ? (
          <div className="text-muted-foreground">当前没有 active run。</div>
        ) : (
          runs.slice(0, 4).map((record) => (
            <button
              key={record.runId}
              type="button"
              onClick={() => void selectRun(record.runId)}
              className="w-full rounded-lg border px-3 py-2 text-left"
            >
              <div className="font-medium">{record.run.run_id}</div>
              <div className="text-xs text-muted-foreground">
                {record.run.status} · {formatTime(record.run.updated_at)}
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
