import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Background,
  ReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type FitViewOptions,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type DefaultEdgeOptions,
  Controls,
  MiniMap,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react';

import {
  RunFlowStepNode,
  PromptStepNode,
  BranchStepNode,
  EndStepNode,
  ChoiceStepNode,
} from './session-nodes';
import { SessionPaneContextMenu, type ContextMenuState } from './SessionPaneContextMenu';
import { SessionToolbar } from './components/SessionToolbar';
import { SessionRunDialog } from './components/SessionRunDialog';
import { useStudioCommands, useStudioResources } from '@/kernel/hooks';
import { useSessionNodeOverlay } from '@/hooks/use-node-overlay';
import { useCanvasSelection } from '@/hooks/use-canvas-selection';
import { layoutDag } from '@/utils/graph-layout';
import { ElegantEdge } from './edges/ElegantEdge';
import { AUTO_SAVE_DEBOUNCE_MS } from '@/constants/editor';
import { SESSION_STEP_DEFAULTS } from './session-nodes/defaults';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import type {
  SessionDefinition,
  SessionStep,
  BranchStep,
  ChoiceStep,
  DynamicChoiceStep,
} from '@/types/project';

const sessionNodeTypes = {
  RunFlow: RunFlowStepNode,
  Prompt: PromptStepNode,
  Branch: BranchStepNode,
  End: EndStepNode,
  Choice: ChoiceStepNode,
  DynamicChoice: ChoiceStepNode,
};

const fitViewOptions: FitViewOptions = { padding: 100 };
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'elegant',
  animated: true,
  interactionWidth: 20,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
};

const sessionEdgeTypes = {
  elegant: ElegantEdge,
};

const SESSION_LAYOUT = { nodeWidth: 400, nodeHeight: 220, gapX: 80, gapY: 40 };

/** Convert SessionDefinition → ReactFlow nodes + edges */
function sessionToReactFlow(session: SessionDefinition): { nodes: Node[]; edges: Edge[] } {
  // 先构建边
  const edges: Edge[] = [];
  for (const step of session.steps) {
    if (step.type === 'RunFlow' || step.type === 'Prompt' || step.type === 'Choice' || step.type === 'DynamicChoice') {
      if (step.next) {
        edges.push({
          id: `e-${step.id}-next-${step.next}`,
          source: step.id,
          sourceHandle: 'next',
          target: step.next,
          targetHandle: 'target',
        });
      }
    } else if (step.type === 'Branch') {
      const branch = step as BranchStep;
      branch.conditions.forEach((cond, i) => {
        if (cond.next) {
          edges.push({
            id: `e-${step.id}-cond${i}-${cond.next}`,
            source: step.id,
            sourceHandle: `condition-${i}`,
            target: cond.next,
            targetHandle: 'target',
          });
        }
      });
      if (branch.default) {
        edges.push({
          id: `e-${step.id}-default-${branch.default}`,
          source: step.id,
          sourceHandle: 'default',
          target: branch.default,
          targetHandle: 'target',
        });
      }
    }
  }

  // 用拓扑排序计算布局
  const stepIds = session.steps.map((s) => s.id);
  const { positions: layoutPositions, backEdges } = layoutDag(stepIds, edges, SESSION_LAYOUT);

  const nodes: Node[] = session.steps.map((step) => ({
    id: step.id,
    type: step.type,
    position: layoutPositions.get(step.id) ?? { x: 0, y: 0 },
    data: {
      label: SESSION_STEP_DEFAULTS[step.type]?.label || step.type,
      config: stepToConfig(step),
    },
  }));

  // 识别回边并应用差异化样式
  const styledEdges = edges.map((edge) => {
    const isBack = backEdges.has(`${edge.source}->${edge.target}`);

    if (isBack) {
      return {
        ...edge,
        type: 'smoothstep',
        style: {
          stroke: '#f59e0b',
          strokeWidth: 2,
          strokeDasharray: '8 4',
        },
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#f59e0b',
        },
        label: i18n.t('cycle', { ns: 'session' }),
        labelStyle: {
          fill: '#f59e0b',
          fontWeight: 600,
          fontSize: 12,
        },
      };
    }

    return edge;
  });

  return { nodes, edges: styledEdges };
}

function stepToConfig(step: SessionStep): Record<string, unknown> {
  switch (step.type) {
    case 'RunFlow':
      return { flowRef: step.flowRef, next: step.next };
    case 'Prompt':
      return {
        flowRef: step.flowRef || '',
        inputChannel: step.inputChannel || 'user_input',
        stateKey: step.stateKey || '',
        promptText: step.promptText || '',
        next: step.next,
      };
    case 'Branch':
      return { conditions: step.conditions, default: step.default, defaultSetState: step.defaultSetState };
    case 'End':
      return { message: step.message || '' };
    case 'Choice':
      return {
        promptText: step.promptText || '',
        options: (step as ChoiceStep).options || [],
        flowRef: (step as ChoiceStep).flowRef || '',
        inputChannel: (step as ChoiceStep).inputChannel || 'choice',
        stateKey: (step as ChoiceStep).stateKey || '',
        next: step.next,
      };
    case 'DynamicChoice':
      return {
        promptText: step.promptText || '',
        options: (step as DynamicChoiceStep).options || [],
        optionsFromState: (step as DynamicChoiceStep).optionsFromState,
        flowRef: (step as DynamicChoiceStep).flowRef || '',
        inputChannel: (step as DynamicChoiceStep).inputChannel || 'choice',
        stateKey: (step as DynamicChoiceStep).stateKey || '',
        next: step.next,
      };
  }
}

/** Convert ReactFlow nodes + edges → SessionDefinition */
function reactFlowToSession(
  nodes: Node[],
  edges: Edge[],
  existing: SessionDefinition | null,
): SessionDefinition {
  const steps: SessionStep[] = nodes.map((node) => {
    const config = (node.data as any).config || {};
    const type = node.type as SessionStep['type'];

    // Find outgoing edges for this node
    const outEdges = edges.filter((e) => e.source === node.id);

    switch (type) {
      case 'RunFlow': {
        const nextEdge = outEdges.find((e) => e.sourceHandle === 'next');
        return {
          id: node.id,
          type: 'RunFlow',
          flowRef: config.flowRef || '',
          next: nextEdge?.target || '',
        };
      }
      case 'Prompt': {
        const nextEdge = outEdges.find((e) => e.sourceHandle === 'next');
        return {
          id: node.id,
          type: 'Prompt',
          flowRef: config.flowRef || undefined,
          inputChannel: config.flowRef ? (config.inputChannel || 'user_input') : undefined,
          stateKey: config.stateKey || undefined,
          promptText: config.promptText || undefined,
          next: nextEdge?.target || '',
        };
      }
      case 'Branch': {
        const conditions: BranchStep['conditions'] = (config.conditions || []).map(
          (cond: { when: BranchStep['conditions'][number]['when']; setState?: Record<string, unknown> }, i: number) => {
            const condEdge = outEdges.find((e) => e.sourceHandle === `condition-${i}`);
            return { when: cond.when, next: condEdge?.target || '', setState: cond.setState };
          }
        );
        const defaultEdge = outEdges.find((e) => e.sourceHandle === 'default');
        return {
          id: node.id,
          type: 'Branch',
          conditions,
          default: defaultEdge?.target || '',
          defaultSetState: config.defaultSetState || undefined,
        };
      }
      case 'End':
        return {
          id: node.id,
          type: 'End',
          message: config.message || undefined,
        };
      case 'Choice': {
        const nextEdge = outEdges.find((e) => e.sourceHandle === 'next');
        return {
          id: node.id,
          type: 'Choice',
          promptText: config.promptText || '',
          options: config.options || [],
          flowRef: config.flowRef || undefined,
          inputChannel: config.flowRef ? (config.inputChannel || 'choice') : undefined,
          stateKey: config.stateKey || undefined,
          next: nextEdge?.target || '',
        };
      }
      case 'DynamicChoice': {
        const nextEdge = outEdges.find((e) => e.sourceHandle === 'next');
        return {
          id: node.id,
          type: 'DynamicChoice',
          promptText: config.promptText || '',
          options: config.options || [],
          optionsFromState: config.optionsFromState || undefined,
          flowRef: config.flowRef || undefined,
          inputChannel: config.flowRef ? (config.inputChannel || 'choice') : undefined,
          stateKey: config.stateKey || undefined,
          next: nextEdge?.target || '',
        };
      }
      default:
        return { id: node.id, type: 'End' } as SessionStep;
    }
  });

  return {
    schemaVersion: existing?.schemaVersion || '1.0',
    name: existing?.name,
    description: existing?.description,
    entryStep: existing?.entryStep,
    steps,
  };
}

function SessionEditorInner() {
  const { t } = useTranslation('session');
  const { session } = useStudioResources();
  const { saveSession, deleteSession } = useStudioCommands();
  const overlayMap = useSessionNodeOverlay();
  const setSelection = useCanvasSelection((s) => s.setSelection);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      setSelection(selected.length === 1 ? selected[0].id : null, 'session');
    },
    [setSelection],
  );

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const isLoadingRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });

  // Load session data
  useEffect(() => {
    if (session) {
      isLoadingRef.current = true;
      const { nodes: n, edges: e } = sessionToReactFlow(session);
      setNodes(n);
      setEdges(e);
      setInitialized(true);
      requestAnimationFrame(() => {
        isLoadingRef.current = false;
      });
    } else {
      setNodes([]);
      setEdges([]);
      setInitialized(false);
    }
  }, [session]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    setContextMenu({ open: true, x: event.clientX, y: event.clientY });
  }, []);

  const addNodeAtPosition = useCallback(
    (position: { x: number; y: number }, nodeType: string) => {
      const defaults = SESSION_STEP_DEFAULTS[nodeType];
      setNodes((nds) => [
        ...nds,
        {
          id: `${nodeType}-${Date.now()}`,
          position,
          data: {
            label: defaults?.label || nodeType,
            config: defaults?.config ? { ...defaults.config } : {},
          },
          type: nodeType,
        },
      ]);
      // If no session yet, mark as initialized so auto-save kicks in
      if (!initialized) setInitialized(true);
    },
    [initialized],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [],
  );

  const buildSessionDef = useCallback((): SessionDefinition => {
    return reactFlowToSession(nodes, edges, session);
  }, [nodes, edges, session]);

  // Auto-save (debounce configurable constant)
  useEffect(() => {
    if (!initialized) return;
    if (isLoadingRef.current) return;

    const timeoutId = setTimeout(async () => {
      try {
        await saveSession(buildSessionDef());
      } catch (error) {
        console.error('Session auto-save failed:', error);
      }
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, initialized, saveSession, buildSessionDef]);

  const handleManualSave = useCallback(async () => {
    try {
      await saveSession(buildSessionDef());
    } catch (error) {
      console.error('Session save failed:', error);
      alert(t('saveFailed', { message: (error as Error).message }));
    }
  }, [buildSessionDef, saveSession]);

  const handleExport = useCallback(() => {
    const def = buildSessionDef();
    const dataStr = JSON.stringify(def, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'session.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [buildSessionDef]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteSession();
      setNodes([]);
      setEdges([]);
      setInitialized(false);
    } catch (error) {
      alert(t('deleteFailed', { message: (error as Error).message }));
    }
  }, [deleteSession]);

  const handleCreate = useCallback(() => {
    // Just mark as initialized so user can start adding nodes
    setInitialized(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  // 将 overlay state 注入到每个 node 的 data 中
  const nodesWithOverlay = useMemo(
    () =>
      nodes.map((node) => {
        const overlay = overlayMap.get(node.id);
        if (!overlay) return node;
        return { ...node, data: { ...node.data, overlay } };
      }),
    [nodes, overlayMap],
  );

  return (
    <div className="relative h-full w-full">
      <SessionToolbar
        hasSession={!!session || initialized}
        onSave={handleManualSave}
        onExport={handleExport}
        onDelete={handleDelete}
        onCreate={handleCreate}
        onRun={() => setRunDialogOpen(true)}
        canRun={!!session}
      />
      <SessionRunDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} />
      <ReactFlow
        nodes={nodesWithOverlay}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={sessionNodeTypes}
        edgeTypes={sessionEdgeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'RunFlow') return '#3b82f6';
            if (node.type === 'Prompt') return '#22c55e';
            if (node.type === 'Branch') return '#f59e0b';
            if (node.type === 'End') return '#ef4444';
            if (node.type === 'Choice') return '#14b8a6';
            return '#94a3b8';
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
        <SessionPaneContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu((m) => ({ ...m, open: false }))}
          onAddNode={addNodeAtPosition}
        />
      </ReactFlow>
    </div>
  );
}

export default function SessionEditor() {
  return (
    <ReactFlowProvider>
      <SessionEditorInner />
    </ReactFlowProvider>
  );
}
