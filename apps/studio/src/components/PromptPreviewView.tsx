import { useEffect, useMemo, useRef, useState } from "react";
import { Focus, MessageSquareQuote, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { usePromptPreview, useWorkbench } from "@/kernel/hooks";
import { useCanvasSelection } from "@/hooks/use-canvas-selection";

/** 根据画布选中节点生成匹配的 entry id */
function selectedEntryId(
  nodeId: string | null,
  context: 'flow' | 'session' | null,
  activeFlowId: string | null,
): string | null {
  if (!nodeId || !context) return null;
  if (context === 'session') return `session:${nodeId}`;
  if (context === 'flow' && activeFlowId) return `flow:${activeFlowId}:${nodeId}`;
  return null;
}

export function PromptPreviewView() {
  const { entries, total } = usePromptPreview();
  const { activeFlowId } = useWorkbench();
  const { selectedNodeId, selectionContext } = useCanvasSelection();
  const [query, setQuery] = useState("");
  const highlightRef = useRef<HTMLElement>(null);

  const matchedId = useMemo(
    () => selectedEntryId(selectedNodeId, selectionContext, activeFlowId),
    [selectedNodeId, selectionContext, activeFlowId],
  );

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return entries;
    }

    return entries.filter((entry) =>
      [
        entry.title,
        entry.subtitle,
        entry.promptText,
        ...entry.bindings.map((binding) => `${binding.key} ${binding.value}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [entries, query]);

  // 将匹配的 entry 置顶排序
  const sortedEntries = useMemo(() => {
    if (!matchedId) return filteredEntries;
    return [...filteredEntries].sort((a, b) => {
      if (a.id === matchedId) return -1;
      if (b.id === matchedId) return 1;
      return 0;
    });
  }, [filteredEntries, matchedId]);

  // 选中节点变化时自动滚动到高亮 entry
  useEffect(() => {
    if (matchedId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [matchedId]);

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Prompt Preview</h1>
            <p className="text-sm text-muted-foreground">
              预览 Session prompts 与 Flow 中的 prompt-like 配置。在画布中选中节点可自动定位。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {matchedId && (
              <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
                <Focus className="size-3" />
                已联动
              </div>
            )}
            <div className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
              {sortedEntries.length} / {total} entries
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 prompt 文本、绑定、Flow 或步骤..."
            className="pl-10"
          />
        </div>

        {sortedEntries.length === 0 ? (
          <EmptyState message="当前没有可预览的 prompt 内容。" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {sortedEntries.map((entry) => {
              const isHighlighted = entry.id === matchedId;
              return (
                <section
                  key={entry.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={`space-y-4 rounded-2xl border bg-card p-5 transition-all duration-300 ${
                    isHighlighted
                      ? "ring-2 ring-primary/50 border-primary/40 shadow-md"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <MessageSquareQuote className={`mt-0.5 size-4 ${isHighlighted ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="space-y-1">
                      <div className="font-medium">{entry.title}</div>
                      <div className="text-xs text-muted-foreground">{entry.subtitle}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{entry.resourceId}</div>
                    </div>
                  </div>

                  <pre className="min-h-28 whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-sm leading-6">
                    {entry.promptText}
                  </pre>

                  {entry.bindings.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {entry.bindings.map((binding) => (
                        <span
                          key={`${entry.id}:${binding.key}:${binding.value}`}
                          className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {binding.key}: {binding.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
