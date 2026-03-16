import { useEffect } from 'react';
import { Package, Download, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePackages, useStudioCommands } from '@/kernel/hooks';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export function PackageManagerView() {
  const { installed, loading } = usePackages();
  const { loadPackages } = useStudioCommands();

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="size-4" />
              <div>
                <h1 className="text-lg font-semibold">Package Manager</h1>
                <p className="text-sm text-muted-foreground">
                  管理项目本地安装的包、模板和扩展。
                </p>
              </div>
            </div>
            <Button onClick={() => void loadPackages()} disabled={loading}>
              刷新
            </Button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              正在加载包列表...
            </div>
          ) : installed.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              当前项目没有安装任何包。
              <br />
              包应放置在项目的 <code className="rounded bg-muted px-1 py-0.5">packages/</code> 目录下。
            </div>
          ) : (
            <div className="space-y-3">
              {installed.map((pkg) => (
                <div
                  key={pkg.manifest.id}
                  className="rounded-xl border bg-card p-4 transition-colors hover:bg-accent/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{pkg.manifest.name}</h3>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {pkg.manifest.kind}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          v{pkg.manifest.version}
                        </span>
                      </div>
                      {pkg.manifest.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {pkg.manifest.description}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {pkg.manifest.author ? (
                          <span>作者: {pkg.manifest.author}</span>
                        ) : null}
                        <span>安装于: {formatTime(pkg.installedAt)}</span>
                        {pkg.manifest.capabilities && pkg.manifest.capabilities.length > 0 ? (
                          <span>
                            权限: {pkg.manifest.capabilities.join(', ')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {pkg.enabled ? (
                        <CheckCircle className="size-4 text-green-500" />
                      ) : (
                        <AlertCircle className="size-4 text-yellow-500" />
                      )}
                    </div>
                  </div>

                  {pkg.manifest.contributes ? (
                    <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs">
                      <div className="font-medium">贡献内容:</div>
                      <div className="mt-1 space-y-1 text-muted-foreground">
                        {pkg.manifest.contributes.nodes && pkg.manifest.contributes.nodes.length > 0 ? (
                          <div>• {pkg.manifest.contributes.nodes.length} 个自定义节点</div>
                        ) : null}
                        {pkg.manifest.contributes.views && pkg.manifest.contributes.views.length > 0 ? (
                          <div>• {pkg.manifest.contributes.views.length} 个视图</div>
                        ) : null}
                        {pkg.manifest.contributes.templates && pkg.manifest.contributes.templates.length > 0 ? (
                          <div>• {pkg.manifest.contributes.templates.length} 个模板</div>
                        ) : null}
                        {pkg.manifest.contributes.themes && pkg.manifest.contributes.themes.length > 0 ? (
                          <div>• {pkg.manifest.contributes.themes.length} 个主题</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="text-base font-semibold">安装新包</h2>
            <p className="text-sm text-muted-foreground">
              将包目录复制到项目的 <code className="rounded bg-muted px-1 py-0.5">packages/</code> 目录，然后点击刷新。
            </p>
          </div>
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            <Download className="mx-auto mb-2 size-8 opacity-50" />
            <div>从本地路径或 URL 安装包的功能即将推出。</div>
            <div className="mt-1">当前请手动将包复制到 packages/ 目录。</div>
          </div>
        </section>
      </div>
    </div>
  );
}
