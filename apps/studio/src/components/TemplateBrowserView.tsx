import { useEffect, useState } from 'react';
import { LayoutTemplate, Eye, FolderInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { usePackages, useStudioCommands } from '@/kernel/hooks';
import type { TemplateEntry } from '@/types/project';

export function TemplateBrowserView() {
  const { installed } = usePackages();
  const { loadPackages, applyTemplate } = useStudioCommands();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateEntry | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  // 从已安装的 template-pack 和 starter-pack 中提取模板
  const allTemplates: Array<TemplateEntry & { packageName: string; packageId: string }> = installed
    .filter((pkg) => pkg.manifest.kind === 'template-pack' || pkg.manifest.kind === 'starter-pack')
    .flatMap((pkg) =>
      (pkg.manifest.contributes?.templates ?? []).map((tpl) => ({
        ...tpl,
        packageName: pkg.manifest.name,
        packageId: pkg.manifest.id,
      })),
    );

  const categories = [...new Set(allTemplates.map((t) => t.category ?? 'Other'))];
  const filtered = selectedCategory
    ? allTemplates.filter((t) => (t.category ?? 'Other') === selectedCategory)
    : allTemplates;

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="size-4" />
            <div>
              <h1 className="text-lg font-semibold">Template Browser</h1>
              <p className="text-sm text-muted-foreground">
                浏览项目本地和已安装包中的模板，预览并应用到当前项目。
              </p>
            </div>
          </div>

          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  selectedCategory === null ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                }`}
              >
                All ({allTemplates.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    selectedCategory === cat ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  }`}
                >
                  {cat} ({allTemplates.filter((t) => (t.category ?? 'Other') === cat).length})
                </button>
              ))}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState message={allTemplates.length === 0
              ? '当前没有可用的模板。安装 template-pack 或 starter-pack 后即可在此浏览。'
              : '当前分类下没有模板。'} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((tpl) => (
                <div
                  key={`${tpl.packageName}-${tpl.id}`}
                  className="rounded-xl border bg-card p-4 transition-colors hover:bg-accent/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold">{tpl.name}</h3>
                      {tpl.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{tpl.description}</p>
                      ) : null}
                    </div>
                    {tpl.category ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{tpl.category}</span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {tpl.flows && tpl.flows.length > 0 ? (
                      <span>{tpl.flows.length} flows</span>
                    ) : null}
                    {tpl.sessionRef ? <span>1 session</span> : null}
                    {tpl.stateKeys && tpl.stateKeys.length > 0 ? (
                      <span>{tpl.stateKeys.length} state keys</span>
                    ) : null}
                    <span className="text-muted-foreground/60">from {tpl.packageName}</span>
                  </div>

                  {tpl.tags && tpl.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tpl.tags.map((tag) => (
                        <span key={tag} className="rounded-full border px-2 py-0.5 text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewTemplate(previewTemplate?.id === tpl.id ? null : tpl)}
                    >
                      <Eye className="mr-1 size-3" />
                      {previewTemplate?.id === tpl.id ? '收起预览' : '预览'}
                    </Button>
                    <Button
                      size="sm"
                      disabled={applying === tpl.id}
                      onClick={async () => {
                        setApplying(tpl.id);
                        try {
                          await applyTemplate(tpl.id, tpl.packageId);
                        } catch {
                          // error handled by store
                        } finally {
                          setApplying(null);
                        }
                      }}
                    >
                      <FolderInput className="mr-1 size-3" />
                      {applying === tpl.id ? '应用中...' : '应用到项目'}
                    </Button>
                  </div>

                  {previewTemplate?.id === tpl.id ? (
                    <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs">
                      <div className="font-medium">模板内容预览</div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        {tpl.flows && tpl.flows.length > 0 ? (
                          <div>Flows: {tpl.flows.join(', ')}</div>
                        ) : null}
                        {tpl.sessionRef ? <div>Session: {tpl.sessionRef}</div> : null}
                        {tpl.stateKeys && tpl.stateKeys.length > 0 ? (
                          <div>State Keys: {tpl.stateKeys.join(', ')}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
