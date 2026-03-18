import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { usePackages, useStudioCommands } from '@/kernel/hooks';
import { formatDateTime } from '@/i18n/format';

export function PackageManagerView() {
  const { t } = useTranslation('packages');
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
                <h1 className="text-lg font-semibold">{t('manager.title')}</h1>
                <p className="text-sm text-muted-foreground">
                  {t('manager.subtitle')}
                </p>
              </div>
            </div>
            <Button onClick={() => void loadPackages()} disabled={loading}>
              {t('manager.refresh')}
            </Button>
          </div>

          {loading ? (
            <EmptyState message={t('manager.loading')} />
          ) : installed.length === 0 ? (
            <EmptyState message={<>{t('manager.noPackages')}<br />{t('manager.noPackagesDetail')}</>} />
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
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        {pkg.trustLevel}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pkg.enabled ? 'bg-green-500/10 text-green-700' : 'bg-yellow-500/10 text-yellow-700'}`}>
                        {pkg.enabled ? 'enabled' : 'disabled'}
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
                          <span>{t('manager.author', { name: pkg.manifest.author })}</span>
                        ) : null}
                        <span>{t('manager.installedTime', { time: formatDateTime(pkg.installedAt) })}</span>
                        {pkg.manifest.capabilities && pkg.manifest.capabilities.length > 0 ? (
                          <span>
                            {t('manager.capabilities', { list: pkg.manifest.capabilities.join(', ') })}
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
                      <div className="font-medium">{t('manager.contributions')}</div>
                      <div className="mt-1 space-y-1 text-muted-foreground">
                        {pkg.manifest.contributes.nodes && pkg.manifest.contributes.nodes.length > 0 ? (
                          <div>• {t('manager.customNodes', { count: pkg.manifest.contributes.nodes.length })}</div>
                        ) : null}
                        {pkg.manifest.contributes.views && pkg.manifest.contributes.views.length > 0 ? (
                          <div>• {t('manager.views', { count: pkg.manifest.contributes.views.length })}</div>
                        ) : null}
                        {pkg.manifest.contributes.templates && pkg.manifest.contributes.templates.length > 0 ? (
                          <div>• {t('manager.templatesCount', { count: pkg.manifest.contributes.templates.length })}</div>
                        ) : null}
                        {pkg.manifest.contributes.themes && pkg.manifest.contributes.themes.length > 0 ? (
                          <div>• {t('manager.themes', { count: pkg.manifest.contributes.themes.length })}</div>
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
            <h2 className="text-base font-semibold">{t('manager.installNew')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('manager.installDescription')}
            </p>
          </div>
          <EmptyState icon={Download} message={t('manager.installComingSoon')} description={t('manager.installManual')} />
        </section>
      </div>
    </div>
  );
}
