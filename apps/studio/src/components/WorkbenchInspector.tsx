import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Crosshair, Layers2, Puzzle, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatTimeFromTimestamp } from '@/i18n/format';
import {
  useCapabilityGate,
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

type InspectorTab = 'node' | 'flow' | 'extension' | 'session';

export function WorkbenchInspector({ mobile }: { mobile?: boolean } = {}) {
  const { t } = useTranslation('workbench');
  const { t: tc } = useTranslation('common');
  const { t: tr } = useTranslation('registry');
  const { activeExtension, activeExtensionRuntime, activeFlowId, activeView } = useWorkbench();
  const { project, session } = useStudioResources();
  const { resetCapabilityGrants, setCapabilityGrant, setExtensionEnabled } = useStudioCommands();
  const inspectors = useInspectorContributions();
  const debugViews = useDebugViewContributions();
  const capabilityGate = useCapabilityGate(activeExtension?.capabilities);
  const activeFlow = activeFlowId ? project?.flows[activeFlowId] : null;
  const { selectedNodeId, selectionContext } = useCanvasSelection();

  const [activeTab, setActiveTab] = useState<InspectorTab>('flow');
  const prevSelectedRef = useRef<string | null>(null);

  // Auto-switch to node tab when a node is selected
  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevSelectedRef.current) {
      setActiveTab('node');
    }
    prevSelectedRef.current = selectedNodeId;
  }, [selectedNodeId]);

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

  const tabs: { id: InspectorTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'node', label: t('inspectorTab.node'), icon: <Crosshair className="size-3.5" /> },
    { id: 'flow', label: t('inspectorTab.flow'), icon: <Layers2 className="size-3.5" /> },
    { id: 'extension', label: t('inspectorTab.extension'), icon: <Puzzle className="size-3.5" /> },
    { id: 'session', label: t('inspectorTab.session'), icon: <Route className="size-3.5" /> },
  ];

  return (
    <aside className={mobile ? "flex flex-col" : "flex h-full flex-col overflow-hidden bg-background/70"}>
      {/* Header — context-aware */}
      <div className="border-b p-4">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {t('inspector')}
        </p>
        {activeTab === 'node' && selectedNodeManifest ? (
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

      {/* Tab bar */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs transition-colors ${
              activeTab === tab.id
                ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 space-y-6 overflow-auto p-4">
        {/* ── Node tab ── */}
        {activeTab === 'node' && (
          selectedNodeManifest ? (
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
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Crosshair className="size-8 opacity-30" />
              <p>{t('noNodeSelected')}</p>
            </div>
          )
        )}

        {/* ── Flow tab ── */}
        {activeTab === 'flow' && (
          activeFlow ? (
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
              </div>
            </section>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Layers2 className="mx-auto mb-2 size-8 opacity-30" />
              <p>No active flow.</p>
            </div>
          )
        )}

        {/* ── Extension tab ── */}
        {activeTab === 'extension' && (
          activeExtension ? (
            <section className="space-y-3">
              <div className="min-w-0 space-y-2 text-sm">
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span className="shrink-0 text-muted-foreground">ID</span>
                  <span className="truncate font-medium">{activeExtension.id}</span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span className="shrink-0 text-muted-foreground">{t("status")}</span>
                  <span className="truncate">{activeExtensionRuntime?.status ?? tc('notActivated')}</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {capabilityGate.resolved.map((entry) => (
                    <button
                      key={entry.capability}
                      type="button"
                      onClick={() => setCapabilityGrant(entry.capability, !entry.granted)}
                      className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
                        entry.granted ? 'border-green-600/40 text-green-700' : 'border-yellow-600/40 text-yellow-700'
                      }`}
                      title={tr(entry.prompt)}
                    >
                      {entry.capability}
                    </button>
                  ))}
                </div>

                <CollapsibleSection title={t("extensionDetails")}>
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
                          <span className="text-muted-foreground">{t("blocked")}</span>
                          <span>{activeExtensionRuntime.missingCapabilities.length}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">{t("degraded")}</span>
                          <span>{activeExtensionRuntime.optionalCapabilities.length}</span>
                        </div>
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
                    {capabilityGate.resolved.map((entry) => (
                      <div key={`${entry.capability}:meta`} className="min-w-0 rounded-lg border p-2">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <span className="truncate font-mono">{entry.capability}</span>
                          <span className={`shrink-0 ${entry.granted ? 'text-green-700' : 'text-yellow-700'}`}>
                            {entry.granted ? t('capabilityGranted') : entry.required ? t('capabilityBlocked') : t('capabilityDegraded')}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-muted-foreground">
                          {entry.descriptor.host} · {entry.descriptor.scope} · {entry.restrictedMode}
                        </div>
                      </div>
                    ))}
                    {activeExtension.activationEvents.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {activeExtension.activationEvents.map((eventName) => (
                          <span key={eventName} className="rounded-full border px-2 py-0.5 font-mono">
                            {eventName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </CollapsibleSection>

                {activeExtensionRuntime ? (
                  <div className="flex gap-2">
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={resetCapabilityGrants}
                    >
                      {t("resetGrants")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Puzzle className="mx-auto mb-2 size-8 opacity-30" />
              <p>No active extension.</p>
            </div>
          )
        )}

        {/* ── Session tab ── */}
        {activeTab === 'session' && (
          <section className="space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("status")}</span>
                <span>{session ? t('loaded') : t('notConfigured')}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("stepCount")}</span>
                <span>{session?.steps.length ?? 0}</span>
              </div>
            </div>
          </section>
        )}

        {/* Extension-contributed inspectors & debug views */}
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
      </div>
    </aside>
  );
}
