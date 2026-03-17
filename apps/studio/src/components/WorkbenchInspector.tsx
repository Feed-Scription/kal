import { useState } from 'react';
import { ChevronDown, ChevronRight, Crosshair, Layers2, Puzzle, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export function WorkbenchInspector({ mobile }: { mobile?: boolean } = {}) {
  const { activeExtension, activeExtensionRuntime, activeFlowId, activeView } = useWorkbench();
  const { project, session } = useStudioResources();
  const { resetCapabilityGrants, setCapabilityGrant, setExtensionEnabled } = useStudioCommands();
  const inspectors = useInspectorContributions();
  const debugViews = useDebugViewContributions();
  const capabilityGate = useCapabilityGate(activeExtension?.capabilities);
  const activeFlow = activeFlowId ? project?.flows[activeFlowId] : null;
  const { selectedNodeId, selectionContext } = useCanvasSelection();

  // 查找选中节点的 manifest 信息
  const selectedNodeManifest = (() => {
    if (!selectedNodeId || !project) return null;
    if (selectionContext === 'flow' && activeFlow) {
      const node = activeFlow.data.nodes.find((n) => n.id === selectedNodeId);
      if (!node) return null;
      const manifest = project.nodeManifests.find((m) => m.type === node.type);
      return { node, manifest: manifest ?? null };
    }
    if (selectionContext === 'session' && session) {
      const step = session.steps.find((s) => s.id === selectedNodeId);
      return step ? { node: { id: step.id, type: step.type, label: step.id }, manifest: null } : null;
    }
    return null;
  })();

  return (
    <aside className={mobile ? "flex flex-col" : "hidden w-80 shrink-0 border-l bg-background/70 xl:flex xl:flex-col"}>
      <div className="border-b p-4">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Inspector
        </p>
        <h2 className="mt-2 text-lg font-semibold">{activeView.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{activeView.description}</p>
      </div>

      <div className="flex-1 space-y-6 overflow-auto p-4">
        {selectedNodeManifest ? (
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Crosshair className="size-4" />
              选中节点
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">ID</span>
                <span className="truncate font-mono text-xs">{selectedNodeManifest.node.id}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">类型</span>
                <span className="font-medium">{selectedNodeManifest.node.type}</span>
              </div>
              {selectedNodeManifest.manifest ? (
                <>
                  {selectedNodeManifest.manifest.category && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">分类</span>
                      <span>{selectedNodeManifest.manifest.category}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">输入</span>
                    <span>{selectedNodeManifest.manifest.inputs.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">输出</span>
                    <span>{selectedNodeManifest.manifest.outputs.length}</span>
                  </div>
                  {selectedNodeManifest.manifest.inputs.length > 0 && (
                    <CollapsibleSection title="输入端口" defaultOpen>
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
                    <CollapsibleSection title="输出端口" defaultOpen>
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
            </div>
          </section>
        ) : null}

        {activeExtension ? (
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Puzzle className="size-4" />
              当前扩展
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">ID</span>
                <span className="font-medium">{activeExtension.id}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">状态</span>
                <span>{activeExtensionRuntime?.status ?? '未激活'}</span>
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
                    title={entry.prompt}
                  >
                    {entry.capability}
                  </button>
                ))}
              </div>

              <CollapsibleSection title="扩展详情">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">宿主</span>
                    <span>{activeExtension.host}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">分类</span>
                    <span>{activeExtension.kind === 'official-core' ? '官方核心' : '官方工作流'}</span>
                  </div>
                  {activeExtensionRuntime ? (
                    <>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Blocked</span>
                        <span>{activeExtensionRuntime.missingCapabilities.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Degraded</span>
                        <span>{activeExtensionRuntime.optionalCapabilities.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">最近激活</span>
                        <span>
                          {activeExtensionRuntime.lastActivatedAt
                            ? new Date(activeExtensionRuntime.lastActivatedAt).toLocaleTimeString('zh-CN', { hour12: false })
                            : '未激活'}
                        </span>
                      </div>
                    </>
                  ) : null}
                  {capabilityGate.resolved.map((entry) => (
                    <div key={`${entry.capability}:meta`} className="rounded-lg border p-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono">{entry.capability}</span>
                        <span className={entry.granted ? 'text-green-700' : 'text-yellow-700'}>
                          {entry.granted ? 'granted' : entry.required ? 'blocked' : 'degraded'}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
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
                    {activeExtensionRuntime.enabled ? '停用' : '启用'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={resetCapabilityGrants}
                  >
                    重置授权
                  </Button>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeFlow ? (
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Layers2 className="size-4" />
              当前 Flow
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">ID</span>
                <span className="font-medium">{activeFlowId}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">节点</span>
                <span>{activeFlow.data.nodes.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">连线</span>
                <span>{activeFlow.data.edges.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">输入</span>
                <span>{activeFlow.meta.inputs?.length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">输出</span>
                <span>{activeFlow.meta.outputs?.length ?? 0}</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Route className="size-4" />
            Session 资源
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">状态</span>
              <span>{session ? '已加载' : '未配置'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">步骤数</span>
              <span>{session?.steps.length ?? 0}</span>
            </div>
          </div>
        </section>

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
