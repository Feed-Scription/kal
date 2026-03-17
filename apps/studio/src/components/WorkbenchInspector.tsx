import { Layers2, Puzzle, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useCapabilityGate,
  useDebugViewContributions,
  useInspectorContributions,
  useStudioCommands,
  useWorkbench,
  useStudioResources,
} from '@/kernel/hooks';
import { ExtensionSurface } from './ExtensionSurface';

export function WorkbenchInspector() {
  const { activeExtension, activeExtensionRuntime, activeFlowId, activeView } = useWorkbench();
  const { project, session } = useStudioResources();
  const { resetCapabilityGrants, setCapabilityGrant, setExtensionEnabled } = useStudioCommands();
  const inspectors = useInspectorContributions();
  const debugViews = useDebugViewContributions();
  const capabilityGate = useCapabilityGate(activeExtension?.capabilities);
  const activeFlow = activeFlowId ? project?.flows[activeFlowId] : null;

  return (
    <aside className="hidden w-80 shrink-0 border-l bg-background/70 xl:flex xl:flex-col">
      <div className="border-b p-4">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Inspector
        </p>
        <h2 className="mt-2 text-lg font-semibold">{activeView.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{activeView.description}</p>
      </div>

      <div className="flex-1 space-y-6 overflow-auto p-4">
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
                <span className="text-muted-foreground">宿主</span>
                <span>{activeExtension.host}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">分类</span>
                <span>{activeExtension.kind === 'official-core' ? '官方核心' : '官方工作流'}</span>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">能力</div>
                <div className="flex flex-wrap gap-2">
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
                      {entry.required ? '' : ' (optional)'}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  点击 capability chip 可模拟授权/降级路径。`required/optional`、host、scope 与 restricted mode 都来自扩展 manifest。
                </div>
                <div className="space-y-2">
                  {capabilityGate.resolved.map((entry) => (
                    <div key={`${entry.capability}:meta`} className="rounded-lg border p-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono">{entry.capability}</span>
                        <span className={entry.granted ? 'text-green-700' : 'text-yellow-700'}>
                          {entry.granted ? 'granted' : entry.required ? 'blocked' : 'degraded'}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {entry.descriptor.host} · {entry.descriptor.scope} · {entry.descriptor.approvalStrategy}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {entry.required ? 'required' : 'optional'} · restricted mode {entry.restrictedMode}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {activeExtensionRuntime ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">运行时</span>
                    <span>{activeExtensionRuntime.status}</span>
                  </div>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExtensionEnabled(activeExtension.id, !activeExtensionRuntime.enabled)
                    }
                  >
                    {activeExtensionRuntime.enabled ? '停用扩展' : '启用扩展'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetCapabilityGrants}
                  >
                    重置 Capability Grants
                  </Button>
                  {activeExtension.activationEvents.length > 0 ? (
                    <div className="space-y-2 rounded-lg border p-3 text-xs">
                      <div className="font-medium">Activation Events</div>
                      <div className="flex flex-wrap gap-2">
                        {activeExtension.activationEvents.map((eventName) => (
                          <span key={eventName} className="rounded-full border px-2 py-0.5 font-mono">
                            {eventName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
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
