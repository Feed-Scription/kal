import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Layers2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatTimeFromTimestamp } from '@/i18n/format';
import {
  useDebugViewContributions,
  useInspectorContributions,
  useStudioCommands,
  useWorkbench,
  useStudioResources,
} from '@/kernel/hooks';
import { useCanvasSelection } from '@/hooks/use-canvas-selection';
import { ExtensionSurface } from './ExtensionSurface';

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {title}
      </button>
      {open && children}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function WorkbenchInspector({ mobile }: { mobile?: boolean } = {}) {
  const { t } = useTranslation('workbench');
  const { t: tc } = useTranslation('common');
  const { t: tr } = useTranslation('registry');
  const { activeExtension, activeExtensionRuntime, activeFlowId, activeView } = useWorkbench();
  const { project, session } = useStudioResources();
  const { setExtensionEnabled } = useStudioCommands();
  const inspectors = useInspectorContributions();
  const debugViews = useDebugViewContributions();
  const activeFlow = activeFlowId ? project?.flows[activeFlowId] : null;
  const { selectedNodeId, selectionContext } = useCanvasSelection();

  // 查找选中节点的 manifest 信息和 config
  const selectedNodeManifest = (() => {
    if (!selectedNodeId || !project) return null;
    if (selectionContext === 'flow' && activeFlow) {
      const node = activeFlow.data.nodes.find((n) => n.id === selectedNodeId);
      if (!node) return null;
      const manifest = project.nodeManifests.find((m) => m.type === node.type);
      return { node, manifest: manifest ?? null, config: node.config ?? null };
    }
    if (selectionContext === 'session' && session) {
      const step = session.steps.find((s) => s.id === selectedNodeId);
      if (!step) return null;
      const { id, type, ...rest } = step;
      return { node: { id, type, label: id }, manifest: null, config: Object.keys(rest).length > 0 ? rest : null };
    }
    return null;
  })();

  const configSummary = useMemo(() => {
    const cfg = selectedNodeManifest?.config;
    if (!cfg || typeof cfg !== 'object') return [];
    return Object.entries(cfg as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([key, val]) => {
        let display: string;
        if (typeof val === 'string') {
          display = val.length > 40 ? val.slice(0, 40) + '…' : val;
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          display = String(val);
        } else if (Array.isArray(val)) {
          display = `[${val.length} items]`;
        } else if (typeof val === 'object') {
          const keys = Object.keys(val as Record<string, unknown>);
          display = keys.length === 0 ? '{}' : `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
        } else {
          display = String(val);
        }
        return { key, display };
      });
  }, [selectedNodeManifest?.config]);

  const hasContextCards = inspectors.length > 0 || debugViews.length > 0;
  const showExtensionInfo = activeExtension != null;

  return (
    <aside className={mobile ? "flex flex-col" : "flex h-full flex-col overflow-hidden bg-background/70"}>
      {/* Header — context-aware */}
      <div className="border-b p-4">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {t('inspector')}
        </p>
        {selectedNodeManifest ? (
          <>
            <h2 className="mt-2 truncate text-lg font-semibold">
              {selectedNodeManifest.node.label || selectedNodeManifest.manifest?.label || selectedNodeManifest.node.type}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {selectedNodeManifest.node.type}
              {selectedNodeManifest.manifest?.category ? ` · ${selectedNodeManifest.manifest.category}` : ''}
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-2 truncate text-lg font-semibold">{tr(activeView.title)}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{tr(activeView.description)}</p>
          </>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 space-y-4 overflow-auto p-4">

        {/* ── Properties section ── */}
        <SectionDivider label={t('properties')} />

        {selectedNodeManifest ? (
          /* Node properties — shown when a node is selected */
          <section className="space-y-3">
            <div className="min-w-0 space-y-2 text-sm">
              <div className="flex min-w-0 items-center justify-between gap-4">
                <span className="shrink-0 text-muted-foreground">ID</span>
                <span className="truncate font-mono text-xs">{selectedNodeManifest.node.id}</span>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-4">
                <span className="shrink-0 text-muted-foreground">{t("type")}</span>
                <span className="truncate font-medium">{selectedNodeManifest.node.type}</span>
              </div>
              {selectedNodeManifest.manifest ? (
                <>
                  {selectedNodeManifest.manifest.category && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">{t("category")}</span>
                      <span>{selectedNodeManifest.manifest.category}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("inputs")}</span>
                    <span>{selectedNodeManifest.manifest.inputs.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("outputs")}</span>
                    <span>{selectedNodeManifest.manifest.outputs.length}</span>
                  </div>
                  {selectedNodeManifest.manifest.inputs.length > 0 && (
                    <CollapsibleSection title={t("inputPorts")} defaultOpen>
                      <div className="space-y-1 text-xs">
                        {selectedNodeManifest.manifest.inputs.map((input) => (
                          <div key={input.name} className="flex items-center justify-between rounded-md border px-2 py-1">
                            <span className="font-mono">{input.name}</span>
                            <span className="text-muted-foreground">{input.type}</span>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}
                  {selectedNodeManifest.manifest.outputs.length > 0 && (
                    <CollapsibleSection title={t("outputPorts")} defaultOpen>
                      <div className="space-y-1 text-xs">
                        {selectedNodeManifest.manifest.outputs.map((output) => (
                          <div key={output.name} className="flex items-center justify-between rounded-md border px-2 py-1">
                            <span className="font-mono">{output.name}</span>
                            <span className="text-muted-foreground">{output.type}</span>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}
                </>
              ) : null}
              {configSummary.length > 0 && (
                <CollapsibleSection title={t("configSummary")} defaultOpen>
                  <div className="space-y-1 text-xs">
                    {configSummary.map(({ key, display }) => (
                      <div key={key} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
                        <span className="font-mono text-muted-foreground">{key}</span>
                        <span className="truncate text-right">{display}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          </section>
        ) : activeFlow ? (
          /* Flow summary — shown when no node is selected but a flow is active */
          <section className="space-y-3">
            <div className="min-w-0 space-y-2 text-sm">
              <div className="flex min-w-0 items-center justify-between gap-4">
                <span className="shrink-0 text-muted-foreground">ID</span>
                <span className="truncate font-medium">{activeFlowId}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("nodes")}</span>
                <span>{activeFlow.data.nodes.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("edges")}</span>
                <span>{activeFlow.data.edges.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("inputs")}</span>
                <span>{activeFlow.meta.inputs?.length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("outputs")}</span>
                <span>{activeFlow.meta.outputs?.length ?? 0}</span>
              </div>
              {/* Session info folded into flow summary */}
              <CollapsibleSection title={t("sessionInfo")}>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("status")}</span>
                    <span>{session ? t('loaded') : t('notConfigured')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("stepCount")}</span>
                    <span>{session?.steps.length ?? 0}</span>
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          </section>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <Layers2 className="size-8 opacity-30" />
            <p>{t('noActiveFlow')}</p>
          </div>
        )}

        {/* ── Context section — extension-contributed inspectors & debug views ── */}
        {hasContextCards && (
          <>
            <SectionDivider label={t('context')} />
            {inspectors.map(({ contribution, runtime }) => (
              <ExtensionSurface
                key={contribution.id}
                contribution={contribution}
                runtime={runtime}
              />
            ))}
            {debugViews.map(({ contribution, runtime }) => (
              <ExtensionSurface
                key={contribution.id}
                contribution={contribution}
                runtime={runtime}
              />
            ))}
          </>
        )}

        {/* ── Extension info — collapsed, mainly for package preset ── */}
        {showExtensionInfo && activeExtension && (
          <>
            <SectionDivider label={t('extensionInfo')} />
            <CollapsibleSection title={`${activeExtension.id} · ${activeExtensionRuntime?.status ?? tc('notActivated')}`}>
              <div className="min-w-0 space-y-2 text-xs">
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span className="shrink-0 text-muted-foreground">{t("host")}</span>
                  <span className="truncate">{activeExtension.host}</span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span className="shrink-0 text-muted-foreground">{t("category")}</span>
                  <span className="truncate">{activeExtension.kind === 'official-core' ? t('extensionKind.officialCore') : t('extensionKind.officialWorkflow')}</span>
                </div>
                {activeExtensionRuntime ? (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">{t("lastActivated")}</span>
                      <span>
                        {activeExtensionRuntime.lastActivatedAt
                          ? formatTimeFromTimestamp(activeExtensionRuntime.lastActivatedAt)
                          : tc('notActivated')}
                      </span>
                    </div>
                  </>
                ) : null}
                {activeExtension.activationEvents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeExtension.activationEvents.map((eventName) => (
                      <span key={eventName} className="rounded-full border px-2 py-0.5 font-mono">
                        {eventName}
                      </span>
                    ))}
                  </div>
                )}
                {activeExtensionRuntime && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() =>
                        setExtensionEnabled(activeExtension.id, !activeExtensionRuntime.enabled)
                      }
                    >
                      {activeExtensionRuntime.enabled ? t('disable') : t('enable')}
                    </Button>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </>
        )}
      </div>
    </aside>
  );
}
