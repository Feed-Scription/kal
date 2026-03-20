/**
 * WorkbenchInspector — context-driven right panel.
 *
 * No tabs. Content switches automatically based on canvas selection:
 * - Node selected → node-specific supplementary info (execution I/O, prompt preview, edit code)
 * - Nothing selected → global debug stream (run management, flow inputs, timeline)
 *
 * Only shows information that ISN'T already visible on the canvas.
 */
import { useState } from 'react';
import { Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  useInspectorContributions,
  useWorkbench,
  useStudioResources,
} from '@/kernel/hooks';
import { useCanvasSelection } from '@/hooks/use-canvas-selection';
import { useNodeExecutionData } from '@/hooks/use-node-execution-data';
import { NodeExecutionInspector } from '@/components/NodeExecutionInspector';
import { DebugStateContextCard } from '@/components/DebugStateContextCard';
import { DebugStreamSidebar } from '@/components/DebugStreamSidebar';
import { ExtensionSurface } from './ExtensionSurface';
import { NodeCodeEditorDialog } from './NodeCodeEditorDialog';

// ── Helpers ───────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function WorkbenchInspector({ mobile }: { mobile?: boolean } = {}) {
  const { t } = useTranslation('workbench');
  const { t: tr } = useTranslation('registry');
  const { activeFlowId, activeView } = useWorkbench();
  const { project, session } = useStudioResources();
  const inspectors = useInspectorContributions();
  const activeFlow = activeFlowId ? project?.flows[activeFlowId] : null;
  const { selectedNodeId, selectionContext } = useCanvasSelection();
  const nodeExecData = useNodeExecutionData(selectedNodeId);
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [codeEditorNodeType, setCodeEditorNodeType] = useState('');

  // ── Node manifest lookup ──
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

  const isCustomNode = selectedNodeManifest != null && project?.customNodes?.includes(selectedNodeManifest.node.type);

  // Show node detail view only for flow nodes (session steps have no supplementary data)
  const showNodeDetail = selectionContext === 'flow' && selectedNodeManifest != null;

  return (
    <aside className={mobile ? "flex flex-col" : "flex h-full flex-col overflow-hidden bg-background/70"}>
      {/* Header — context-aware */}
      <div className="border-b px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {t('inspector')}
        </p>
        {showNodeDetail ? (
          <>
            <h2 className="mt-2 truncate text-lg font-semibold">
              {selectedNodeManifest!.node.label || selectedNodeManifest!.manifest?.label || selectedNodeManifest!.node.type}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {selectedNodeManifest!.node.type}
              {selectedNodeManifest!.manifest?.category ? ` · ${selectedNodeManifest!.manifest.category}` : ''}
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-2 truncate text-lg font-semibold">{tr(activeView.title)}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{tr(activeView.description)}</p>
          </>
        )}
      </div>

      {/* Content — context-driven, no tabs */}
      {showNodeDetail ? (
        /* ── Flow node selected: show supplementary info not visible on canvas ── */
        <div className="flex-1 space-y-4 overflow-auto p-4">
          {/* Execution I/O — the main reason to open inspector after a run */}
          {nodeExecData && (
            <>
              <SectionDivider label={t('execution.title')} />
              <NodeExecutionInspector data={nodeExecData} />
            </>
          )}

          <DebugStateContextCard />

          {/* Extension-contributed inspectors (e.g. Prompt Preview) */}
          {inspectors.length > 0 && inspectors.map(({ contribution, runtime }) => (
            <ExtensionSurface
              key={contribution.id}
              contribution={contribution}
              runtime={runtime}
            />
          ))}

          {/* Edit Code — only for custom nodes, not available on canvas */}
          {isCustomNode && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => {
                setCodeEditorNodeType(selectedNodeManifest!.node.type);
                setCodeEditorOpen(true);
              }}
            >
              <Code2 className="size-3.5" />
              {t('editCode')}
            </Button>
          )}
        </div>
      ) : (
        /* ── Session step selected / nothing selected: show debug stream ── */
        <div className="min-h-0 flex-1 overflow-hidden">
          <DebugStreamSidebar compact />
        </div>
      )}

      <NodeCodeEditorDialog
        nodeType={codeEditorNodeType}
        open={codeEditorOpen}
        onOpenChange={setCodeEditorOpen}
      />
    </aside>
  );
}
