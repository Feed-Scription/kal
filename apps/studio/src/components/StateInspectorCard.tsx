import { useMemo } from "react";
import { Database } from "lucide-react";
import { useStudioResources } from "@/kernel/hooks";

export function StateInspectorCard() {
  const { state } = useStudioResources();
  const entries = useMemo(() => Object.entries(state).slice(0, 5), [state]);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Database className="size-4" />
        State Inspector
      </div>
      <div className="space-y-2 text-sm">
        {entries.length === 0 ? (
          <div className="text-muted-foreground">当前项目没有可展示的 state。</div>
        ) : (
          entries.map(([key, entry]) => (
            <div key={key} className="rounded-lg border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs">{key}</span>
                <span className="text-xs text-muted-foreground">{entry.type}</span>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {typeof entry.value === "object" ? JSON.stringify(entry.value) : String(entry.value)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
