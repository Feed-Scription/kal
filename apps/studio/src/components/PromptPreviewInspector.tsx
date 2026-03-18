import { Focus, Loader2, MessageSquareQuote, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePromptPreviewSelection } from "@/hooks/use-prompt-preview-selection";

export function PromptPreviewInspector() {
  const { t } = useTranslation('preview');
  const { loadingEntries, matchedEntry, matchedId, renderError } = usePromptPreviewSelection();

  if (!matchedId) {
    return null;
  }

  if (loadingEntries) {
    return (
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareQuote className="size-4" />
          {t('prompt.title')}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('prompt.rendering')}
        </div>
      </section>
    );
  }

  if (!matchedEntry) {
    return null;
  }

  const rendered = matchedEntry.rendered;
  const activeFragments = rendered?.fragments.filter((fragment) => fragment.active).length ?? 0;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <MessageSquareQuote className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{t('prompt.title')}</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-primary">
              <Focus className="size-3" />
              {t('prompt.linked')}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{matchedEntry.subtitle}</p>
        </div>
      </div>

      {renderError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {renderError}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{matchedEntry.title}</div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs leading-5">
          {matchedEntry.promptText || '(empty)'}
        </pre>
      </div>

      {rendered ? (
        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            {t('prompt.finalRenderResult')}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px]">
              {t('prompt.fragmentsActive', { active: activeFragments, total: rendered.fragments.length })}
            </span>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/80 p-3 text-xs leading-5">
            {rendered.renderedText || '(empty)'}
          </pre>
        </div>
      ) : null}

      {matchedEntry.bindings.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {matchedEntry.bindings.slice(0, 4).map((binding) => (
            <span
              key={`${matchedEntry.id}:${binding.key}:${binding.value}`}
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {binding.key}: {binding.value}
            </span>
          ))}
          {matchedEntry.bindings.length > 4 ? (
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
              +{matchedEntry.bindings.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
