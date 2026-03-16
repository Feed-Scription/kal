import { AlertTriangle, CircleCheckBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagnostics, useStudioCommands } from "@/kernel/hooks";

export function ProblemsPanel() {
  const { diagnostics } = useDiagnostics();
  const { setActiveView } = useStudioCommands();
  const issues = diagnostics?.diagnostics ?? [];
  const preview = issues.slice(0, 4);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Problems Panel</h3>
          <p className="text-xs text-muted-foreground">底部 panel 通过统一 slot 接入 diagnostics。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveView("kal.problems")}>
          打开详情
        </Button>
      </div>

      {!diagnostics || issues.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-green-600/20 bg-green-600/5 p-3 text-sm text-muted-foreground">
          <CircleCheckBig className="mt-0.5 size-4 text-green-600" />
          当前没有 diagnostics 问题。
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {diagnostics.summary.errors} errors / {diagnostics.summary.warnings} warnings
          </div>
          {preview.map((issue, index) => (
            <div key={`${issue.code}-${index}`} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 text-yellow-600" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{issue.code}</div>
                  <div className="truncate text-xs text-muted-foreground">{issue.message}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
