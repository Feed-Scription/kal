import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  ReactFlow,
  addEdge,
  useReactFlow,
  type Node,
  type Edge,
  type FitViewOptions,
  type OnConnect,
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
import { StepControlToolbar } from './components/StepControlToolbar';
import { useStudioCommands, useStudioResources, useRunDebug, useWorkbenchViewport } from '@/kernel/hooks';
import { useSessionNodeOverlay } from '@/hooks/use-node-overlay';
import { useCanvasSelection } from '@/hooks/use-canvas-selection';
import { useGraphEditor } from '@/hooks/use-graph-editor';
import { useSessionEdgeExecutionState } from '@/hooks/use-edge-execution-state';
import { detectBackEdges, ELK_SESSION_OPTS } from '@/utils/elk-layout';
import { applyBackEdgeStyle } from '@/utils/edge-styling';
import { ElegantEdge } from './edges/ElegantEdge';
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

const fitViewOptions: FitViewOptions = { padding: 100, maxZoom: 1 };
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'elegant',
  animated: true,
  interactionWidth: 20,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
};

const sessionEdgeTypes = {
  elegant: ElegantEdge,
};

/** Convert SessionDefinition → ReactFlow nodes (at origin) + styled edges */
function sessionToReactFlow(session: SessionDefinition): { nodes: Node[]; edges: Edge[] } {
  // Build edges
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

  // Nodes placed at origin — real positions come from ELK after measurement
  const nodes: Node[] = session.steps.map((step) => ({
    id: step.id,
    type: step.type,
    position: { x: 0, y: 0 },
    data: {
      label: SESSION_STEP_DEFAULTS[step.type]?.label || step.type,
      config: stepToConfig(step),
    },
  }));

  // Detect back edges synchronously for styling
  const stepIds = session.steps.map((s) => s.id);
  const backEdges = detectBackEdges(stepIds, edges);
  const cycleLabel = i18n.t('cycle', { ns: 'session' });

  const styledEdges = edges.map((edge) => applyBackEdgeStyle(edge, backEdges, cycleLabel));

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

function sessionCanvasSignature(session: SessionDefinition | null): string {
  return JSON.stringify({
    entryStep: session?.entryStep ?? null,
    steps: session?.steps ?? [],
  });
}

function SessionEditorInner() {
  const { t } = useTranslation('session');
  const { session } = useStudioResources();
  const { saveSession, deleteSession, setCanvasViewport } = useStudioCommands();
  const overlayMap = useSessionNodeOverlay();
  const edgeExecState = useSessionEdgeExecutionState();
  const setSelection = useCanvasSelection((s) => s.setSelection);
  const fitViewTarget = useCanvasSelection((s) => s.fitViewTarget);
  const clearFitViewTarget = useCanvasSelection((s) => s.clearFitViewTarget);
  const highlightedNodeId = useCanvasSelection((s) => s.highlightedNodeId);
  const reactFlowInstance = useReactFlow();
  const savedViewport = useWorkbenchViewport('session');

  // Phase 3: breakpoint auto-focus — when a run pauses at a breakpoint step,
  // fitView to that node so the user immediately sees where execution stopped.
  const { selectedStepId, selectedWaitingStepId } = useRunDebug();
  const lastFocusedStepRef = useRef<string | null>(null);

  useEffect(() => {
    const targetStep = selectedWaitingStepId ?? selectedStepId;
    if (!targetStep || targetStep === lastFocusedStepRef.current) return;
    lastFocusedStepRef.current = targetStep;

    // Small delay to let React Flow settle after state update
    const timer = setTimeout(() => {
      reactFlowInstance.fitView({
        nodes: [{ id: targetStep }],
        padding: 0.5,
        duration: 400,
        maxZoom: 1.2,
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedStepId, selectedWaitingStepId, reactFlowInstance]);

  // Sidebar click-to-locate: consume fitViewTarget from canvas selection store
  useEffect(() => {
    if (!fitViewTarget) return;
    clearFitViewTarget();
    reactFlowInstance.fitView({
      nodes: [{ id: fitViewTarget }],
      padding: 0.5,
      duration: 400,
      maxZoom: 1.2,
    });
  }, [fitViewTarget, clearFitViewTarget, reactFlowInstance]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      setSelection(selected.length === 1 ? selected[0].id : null, 'session');
    },
    [setSelection],
  );

  // ── Shared editor shell ──

  const postLayoutEdges = useCallback(
    (eds: Edge[], backEdges: Set<string>) =>
      eds.map((edge) => applyBackEdgeStyle(edge, backEdges, t('cycle'))),
    [t],
  );

  const onSave = useCallback(
    async (currentNodes: Node[], currentEdges: Edge[]) => {
      const def = reactFlowToSession(currentNodes, currentEdges, session);
      await saveSession(def);
    },
    [session, saveSession],
  );

  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    layoutReady,
    initialized,
    setInitialized,
    handleAutoLayout,
    handleManualSave,
    onMoveEnd,
    onNodesChange,
    onEdgesChange,
    loadGraph,
  } = useGraphEditor({
    elkOptions: ELK_SESSION_OPTS,
    onSave,
    postLayoutEdges,
    savedViewport,
    onViewportChange: (viewport) => setCanvasViewport('session', viewport),
  });

  const currentNodesRef = useRef<Node[]>([]);
  const currentEdgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    currentNodesRef.current = nodes;
    currentEdgesRef.current = edges;
  }, [nodes, edges]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });

  // Load session data when session changes
  useEffect(() => {
    if (session) {
      if (initialized) {
        const currentGraph = reactFlowToSession(currentNodesRef.current, currentEdgesRef.current, session);
        if (sessionCanvasSignature(currentGraph) === sessionCanvasSignature(session)) {
          return;
        }
      }
      loadGraph(sessionToReactFlow(session));
    } else {
      loadGraph(null);
    }
  }, [session, initialized, loadGraph]);

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
    [initialized, setNodes, setInitialized],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  const handleExport = useCallback(() => {
    const def = reactFlowToSession(nodes, edges, session);
    const dataStr = JSON.stringify(def, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'session.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, session]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteSession();
      loadGraph(null);
    } catch (error) {
      alert(t('deleteFailed', { message: (error as Error).message }));
    }
  }, [deleteSession, loadGraph, t]);

  const handleCreate = useCallback(() => {
    // Just mark as initialized so user can start adding nodes
    setInitialized(true);
  }, [setInitialized]);

  const wrappedManualSave = useCallback(async () => {
    try {
      await handleManualSave();
    } catch (error) {
      console.error('Session save failed:', error);
      alert(t('saveFailed', { message: (error as Error).message }));
    }
  }, [handleManualSave, t]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        wrappedManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wrappedManualSave]);

  // 将 overlay state 注入到每个 node 的 data 中，并标记 sidebar hover 高亮
  const nodesWithOverlay = useMemo(
    () =>
      nodes.map((node) => {
        const overlay = overlayMap.get(node.id);
        const isHighlighted = highlightedNodeId === node.id;
        if (!overlay && !isHighlighted) return node;
        return {
          ...node,
          data: { ...node.data, overlay, isHighlighted },
          className: isHighlighted ? 'ring-2 ring-primary/60' : undefined,
        };
      }),
    [nodes, overlayMap, highlightedNodeId],
  );

  // Apply edge execution state CSS classes (same pattern as Flow.tsx)
  const edgesWithExecState = useMemo(() => {
    if (edgeExecState.size === 0) return edges;
    return edges.map((edge) => {
      const key = `${edge.source}->${edge.target}`;
      const status = edgeExecState.get(key);
      if (!status) {
        return edgeExecState.size > 0
          ? { ...edge, className: 'edge-idle' }
          : edge;
      }
      return { ...edge, className: status === 'active' ? 'edge-active' : 'edge-executed' };
    });
  }, [edges, edgeExecState]);

  return (
    <div className="relative h-full w-full" style={{ opacity: layoutReady ? 1 : 0, transition: 'opacity 0.15s ease-in' }}>
      <SessionToolbar
        hasSession={!!session || initialized}
        onSave={wrappedManualSave}
        onExport={handleExport}
        onDelete={handleDelete}
        onCreate={handleCreate}
        onAutoLayout={handleAutoLayout}
      />
      {/* Phase 3: floating step control toolbar when run is paused */}
      <div className="absolute top-14 left-1/2 z-20 -translate-x-1/2">
        <StepControlToolbar />
      </div>
      <ReactFlow
        nodes={nodesWithOverlay}
        edges={edgesWithExecState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        onMoveEnd={onMoveEnd}
        nodeTypes={sessionNodeTypes}
        edgeTypes={sessionEdgeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        defaultEdgeOptions={defaultEdgeOptions}
        minZoom={0.1}
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
