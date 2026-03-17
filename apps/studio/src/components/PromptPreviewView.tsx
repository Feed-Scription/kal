import { useMemo, useState } from "react";
import { MessageSquareQuote, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePromptPreview } from "@/kernel/hooks";

export function PromptPreviewView() {
  const { entries, total } = usePromptPreview();
  const [query, setQuery] = useState("");

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

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Prompt Preview</h1>
            <p className="text-sm text-muted-foreground">
              官方工作流扩展，基于 Kernel 派生查询预览 Session prompts 与 Flow 中的 prompt-like 配置。
            </p>
          </div>
          <div className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            {filteredEntries.length} / {total} entries
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

        {filteredEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
            当前没有可预览的 prompt 内容。
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredEntries.map((entry) => (
              <section key={entry.id} className="space-y-4 rounded-2xl border bg-card p-5">
                <div className="flex items-start gap-3">
                  <MessageSquareQuote className="mt-0.5 size-4 text-primary" />
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
