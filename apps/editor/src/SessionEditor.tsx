import { useState, useCallback, useEffect, useRef } from 'react';
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
import { useProjectStore } from '@/store/projectStore';
import { SESSION_STEP_DEFAULTS } from './session-nodes/defaults';
import type { SessionDefinition, SessionStep, BranchStep, ChoiceStep } from '@/types/project';

const sessionNodeTypes = {
  RunFlow: RunFlowStepNode,
  Prompt: PromptStepNode,
  Branch: BranchStepNode,
  End: EndStepNode,
  Choice: ChoiceStepNode,
};

const fitViewOptions: FitViewOptions = { padding: 100 };
const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
};

const STEP_W = 400;
const STEP_H = 220;
const STEP_GAP_X = 80;
const STEP_GAP_Y = 40;

/**
 * 基于拓扑排序的 session step 自动布局。
 * 从 session 的边关系中提取 DAG，按层级从左到右排列。
 * 回边（target order ≤ source order）不参与拓扑排序，避免破坏层级。
 */
function layoutSessionSteps(
  stepIds: string[],
  edges: Edge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (stepIds.length === 0) return positions;

  // 建立 step 声明顺序索引
  const orderIndex = new Map(stepIds.map((id, i) => [id, i]));

  // 构建邻接表和入度表（跳过回边）
  const idSet = new Set(stepIds);
  const inDegree = new Map<string, number>();
  const children = new Map<string, Set<string>>();
  for (const id of stepIds) {
    inDegree.set(id, 0);
    children.set(id, new Set());
  }
  for (const e of edges) {
    if (idSet.has(e.source) && idSet.has(e.target)) {
      const srcIdx = orderIndex.get(e.source) ?? -1;
      const tgtIdx = orderIndex.get(e.target) ?? -1;
      // 跳过回边：target 在 source 之前或同位置
      if (tgtIdx <= srcIdx) continue;

      children.get(e.source)!.add(e.target);
      inDegree.set(e.target, inDegree.get(e.target)! + 1);
    }
  }

  // BFS 拓扑排序
  const layers: string[][] = [];
  const visited = new Set<string>();
  let queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);

  while (queue.length > 0) {
    layers.push(queue);
    for (const id of queue) visited.add(id);
    const next: string[] = [];
    for (const id of queue) {
      for (const child of children.get(id) ?? []) {
        const newDeg = inDegree.get(child)! - 1;
        inDegree.set(child, newDeg);
        if (newDeg === 0 && !visited.has(child)) {
          next.push(child);
        }
      }
    }
    queue = next;
  }

  // 孤立节点
  for (const id of stepIds) {
    if (!visited.has(id)) {
      layers.push([id]);
      visited.add(id);
    }
  }

  // 分配坐标
  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col];
    const totalH = layer.length * STEP_H + (layer.length - 1) * STEP_GAP_Y;
    const startY = -totalH / 2;
    for (let row = 0; row < layer.length; row++) {
      positions.set(layer[row], {
        x: col * (STEP_W + STEP_GAP_X),
        y: startY + row * (STEP_H + STEP_GAP_Y),
      });
    }
  }

  return positions;
}

/** Convert SessionDefinition → ReactFlow nodes + edges */
function sessionToReactFlow(session: SessionDefinition): { nodes: Node[]; edges: Edge[] } {
  // 先构建边
  const edges: Edge[] = [];
  for (const step of session.steps) {
    if (step.type === 'RunFlow' || step.type === 'Prompt' || step.type === 'Choice') {
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
  const layoutPositions = layoutSessionSteps(stepIds, edges);

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
    const sourcePos = layoutPositions.get(edge.source);
    const targetPos = layoutPositions.get(edge.target);

    // 回边判断：target 在 source 左侧或同位置
    const isBackEdge = sourcePos && targetPos && targetPos.x <= sourcePos.x;

    if (isBackEdge) {
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
        label: '循环',
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
      return { conditions: step.conditions, default: step.default };
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
        const conditions: { when: string; next: string }[] = (config.conditions || []).map(
          (cond: { when: string }, i: number) => {
            const condEdge = outEdges.find((e) => e.sourceHandle === `condition-${i}`);
            return { when: cond.when, next: condEdge?.target || '' };
          }
        );
        const defaultEdge = outEdges.find((e) => e.sourceHandle === 'default');
        return {
          id: node.id,
          type: 'Branch',
          conditions,
          default: defaultEdge?.target || '',
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
  const project = useProjectStore((s) => s.project);
  const saveSession = useProjectStore((s) => s.saveSession);
  const deleteSession = useProjectStore((s) => s.deleteSession);

  const session = project?.session ?? null;

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [initialized, setInitialized] = useState(false);
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

  // Auto-save (debounce 1s)
  useEffect(() => {
    if (!initialized) return;
    if (isLoadingRef.current) return;

    const timeoutId = setTimeout(async () => {
      window.dispatchEvent(new Event('flow:saving'));
      try {
        await saveSession(buildSessionDef());
        window.dispatchEvent(new Event('flow:saved'));
      } catch (error) {
        console.error('Session auto-save failed:', error);
        window.dispatchEvent(new Event('flow:error'));
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, initialized, saveSession, buildSessionDef]);

  const handleManualSave = useCallback(async () => {
    window.dispatchEvent(new Event('flow:saving'));
    try {
      await saveSession(buildSessionDef());
      window.dispatchEvent(new Event('flow:saved'));
    } catch (error) {
      console.error('Session save failed:', error);
      window.dispatchEvent(new Event('flow:error'));
      alert('保存失败: ' + (error as Error).message);
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
      alert('删除失败: ' + (error as Error).message);
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

  return (
    <div className="relative h-full w-full">
      <SessionToolbar
        hasSession={!!session || initialized}
        onSave={handleManualSave}
        onExport={handleExport}
        onDelete={handleDelete}
        onCreate={handleCreate}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={sessionNodeTypes}
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
