import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Focus, Loader2, MessageSquareQuote, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { usePromptPreview, useWorkbench } from "@/kernel/hooks";
import { useCanvasSelection } from "@/hooks/use-canvas-selection";
import { engineApi } from "@/api/engine-client";
import type { PromptRenderResult, RenderedFragment } from "@/types/project";

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

function FragmentCard({ fragment }: { fragment: RenderedFragment }) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        fragment.active
          ? "border-green-500/30 bg-green-500/5"
          : "border-muted bg-muted/20 opacity-60"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className={`inline-block size-2 rounded-full ${fragment.active ? "bg-green-500" : "bg-muted-foreground/40"}`} />
        <span className="font-mono text-xs font-medium">{fragment.id || '(anonymous)'}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{fragment.type}</span>
        {fragment.condition && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600">
            when: {fragment.condition}
          </span>
        )}
      </div>
      {fragment.rendered ? (
        <pre className="whitespace-pre-wrap text-xs leading-5 text-foreground/80">{fragment.rendered}</pre>
      ) : (
        <span className="text-xs italic text-muted-foreground">(inactive)</span>
      )}
    </div>
  );
}

function RenderResultPanel({
  result,
  loading,
  error,
}: {
  result: PromptRenderResult | null;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useTranslation('preview');
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t('prompt.rendering')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!result) return null;

  const activeCount = result.fragments.filter((f) => f.active).length;

  return (
    <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.02] p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-medium">{t('prompt.finalRenderResult')}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
          {t('prompt.fragmentsActive', { active: activeCount, total: result.fragments.length })}
        </span>
      </div>

      <pre className="whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-sm leading-6">
        {result.renderedText || '(empty)'}
      </pre>

      {result.fragments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{t('prompt.fragments')}</div>
          {result.fragments.map((fragment, i) => (
            <FragmentCard key={fragment.id || i} fragment={fragment} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PromptPreviewView() {
  const { t } = useTranslation('preview');
  const { entries, total } = usePromptPreview();
  const { activeFlowId } = useWorkbench();
  const { selectedNodeId, selectionContext } = useCanvasSelection();
  const [query, setQuery] = useState("");
  const highlightRef = useRef<HTMLElement>(null);

  // Render result state for the selected PromptBuild node
  const [renderResult, setRenderResult] = useState<PromptRenderResult | null>(null);
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const matchedId = useMemo(
    () => selectedEntryId(selectedNodeId, selectionContext, activeFlowId),
    [selectedNodeId, selectionContext, activeFlowId],
  );

  // Fetch render result when a flow node is selected
  const fetchRender = useCallback(async (flowId: string, nodeId: string) => {
    setRenderLoading(true);
    setRenderError(null);
    try {
      const result = await engineApi.renderPrompt(flowId, nodeId);
      setRenderResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Not a PromptBuild node or other expected error — just clear
      if (msg.includes('INVALID_NODE_TYPE') || msg.includes('NODE_NOT_FOUND')) {
        setRenderResult(null);
        setRenderError(null);
      } else {
        setRenderError(msg);
      }
    } finally {
      setRenderLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectionContext === 'flow' && activeFlowId && selectedNodeId) {
      fetchRender(activeFlowId, selectedNodeId);
    } else {
      setRenderResult(null);
      setRenderError(null);
    }
  }, [selectionContext, activeFlowId, selectedNodeId, fetchRender]);

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
            <h1 className="text-2xl font-bold">{t('prompt.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('prompt.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {matchedId && (
              <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
                <Focus className="size-3" />
                {t('prompt.linked')}
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
            placeholder={t('prompt.searchPlaceholder')}
            className="pl-10"
          />
        </div>

        {/* Render result panel — shown when a PromptBuild node is selected */}
        <RenderResultPanel result={renderResult} loading={renderLoading} error={renderError} />

        {sortedEntries.length === 0 && !renderResult ? (
          <EmptyState message={t('prompt.noPreviewContent')} />
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
