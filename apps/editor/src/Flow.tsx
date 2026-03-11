import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
} from '@xyflow/react';

import { ManifestNode } from "./nodes/ManifestNode";
import { PaneContextMenu, type ContextMenuState } from "./PaneContextMenu";
import { FlowToolbar } from "./components/FlowToolbar";
import { ExecutionDialog } from "./components/ExecutionDialog";
import { useProjectStore } from "@/store/projectStore";
import type { FlowDefinition, NodeDefinition, EdgeDefinition, NodeManifest } from "@/types/project";

const NODE_W = 320;
const NODE_H = 200;
const GAP_X = 80;
const GAP_Y = 40;

/**
 * 基于拓扑排序的自动布局。
 * 将 DAG 按层级从左到右排列，同层节点从上到下排列。
 * 仅对没有 position 的节点生效。
 */
function autoLayout(
  nodes: NodeDefinition[],
  edges: EdgeDefinition[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // 如果所有节点都有有效的 position（不全堆叠在同一点），直接返回空 map
  const withPos = nodes.filter((n) => n.position);
  if (withPos.length === nodes.length && nodes.length > 1) {
    const allSame = withPos.every(
      (n) => n.position!.x === withPos[0].position!.x && n.position!.y === withPos[0].position!.y,
    );
    if (!allSame) return positions;
  } else if (withPos.length === nodes.length) {
    return positions;
  }

  // 构建邻接表和入度表
  const inDegree = new Map<string, number>();
  const children = new Map<string, Set<string>>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    children.set(n.id, new Set());
  }
  for (const e of edges) {
    if (inDegree.has(e.target)) {
      inDegree.set(e.target, inDegree.get(e.target)! + 1);
    }
    children.get(e.source)?.add(e.target);
  }

  // BFS 拓扑排序，按层分组
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

  // 处理可能的孤立节点（无边连接）
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      layers.push([n.id]);
      visited.add(n.id);
    }
  }

  // 分配坐标：每层一列，同层内垂直排列
  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col];
    const totalH = layer.length * NODE_H + (layer.length - 1) * GAP_Y;
    const startY = -totalH / 2;
    for (let row = 0; row < layer.length; row++) {
      positions.set(layer[row], {
        x: col * (NODE_W + GAP_X),
        y: startY + row * (NODE_H + GAP_Y),
      });
    }
  }

  return positions;
}

const fitViewOptions: FitViewOptions = {
  padding: 100,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
};

export default function Flow() {
  const project = useProjectStore((state) => state.project);
  const currentFlow = useProjectStore((state) => state.currentFlow);
  const saveFlow = useProjectStore((state) => state.saveFlow);

  const manifestMap = useMemo(() => {
    const map = new Map<string, NodeManifest>();
    for (const manifest of project?.nodeManifests || []) {
      map.set(manifest.type, manifest);
    }
    return map;
  }, [project?.nodeManifests]);

  const nodeTypes = useMemo(() => {
    const types: Record<string, typeof ManifestNode> = {};
    for (const manifest of project?.nodeManifests || []) {
      types[manifest.type] = ManifestNode;
    }
    for (const node of project?.flows[currentFlow || ""]?.data.nodes || []) {
      types[node.type] = ManifestNode;
    }
    return types;
  }, [project?.nodeManifests, project?.flows, currentFlow]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const isLoadingRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });

  // Load flow data when currentFlow changes (not when project updates from save)
  useEffect(() => {
    if (project && currentFlow && project.flows[currentFlow]) {
      const flowDef = project.flows[currentFlow];

      isLoadingRef.current = true;

      const layoutPositions = autoLayout(flowDef.data.nodes, flowDef.data.edges);

      const reactFlowNodes: Node[] = flowDef.data.nodes.map((node) => {
        const manifest = manifestMap.get(node.type);
        return {
          id: node.id,
          type: node.type,
          position: layoutPositions.get(node.id) ?? node.position ?? { x: 0, y: 0 },
          data: {
            label: node.label || manifest?.label || node.type,
            manifest,
            config: { ...(manifest?.defaultConfig || {}), ...(node.config || {}) },
            inputs: node.inputs?.length ? node.inputs : manifest?.inputs || [],
            outputs: node.outputs?.length ? node.outputs : manifest?.outputs || [],
          },
        };
      });

      const reactFlowEdges: Edge[] = flowDef.data.edges.map((edge, idx) => ({
        id: `e-${edge.source}-${edge.target}-${idx}`,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle,
      }));

      setNodes(reactFlowNodes);
      setEdges(reactFlowEdges);
      setInitialized(true);

      // Reset loading flag after React processes the state updates
      requestAnimationFrame(() => {
        isLoadingRef.current = false;
      });
    } else {
      setInitialized(false);
    }
  }, [currentFlow, manifestMap, project]);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        open: true,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const addNodeAtPosition = useCallback(
    (position: { x: number; y: number }, nodeType: string) => {
      const manifest = manifestMap.get(nodeType);
      setNodes((nds) => [
        ...nds,
        {
          id: `${nodeType}-${Date.now()}`,
          position,
          data: {
            label: manifest?.label || nodeType,
            manifest,
            config: manifest?.defaultConfig ? { ...manifest.defaultConfig } : {},
            inputs: manifest?.inputs || [],
            outputs: manifest?.outputs || [],
          },
          type: nodeType,
        },
      ]);
    },
    [manifestMap],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  // Build FlowDefinition from current ReactFlow state
  const buildFlowDef = useCallback((): FlowDefinition | null => {
    if (!project || !currentFlow) return null;
    const existingFlow = project.flows[currentFlow];
    return {
      meta: existingFlow?.meta ?? { schemaVersion: '1.0' },
      data: {
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type || 'default',
          label: String(node.data.label || node.type || 'Node'),
          position: node.position,
          inputs: Array.isArray(node.data.inputs) ? node.data.inputs : [],
          outputs: Array.isArray(node.data.outputs) ? node.data.outputs : [],
          config: node.data.config || {},
        })),
        edges: edges.map((edge) => ({
          source: edge.source,
          sourceHandle: edge.sourceHandle || '',
          target: edge.target,
          targetHandle: edge.targetHandle || '',
        })),
      },
    };
  }, [nodes, edges, project, currentFlow]);

  // Auto-save flow when nodes or edges change (skip during load)
  useEffect(() => {
    if (!initialized || !project || !currentFlow) return;
    if (isLoadingRef.current) return;

    const timeoutId = setTimeout(async () => {
      window.dispatchEvent(new Event('flow:saving'));
      const flowDef = buildFlowDef();
      if (!flowDef) return;

      try {
        await saveFlow(currentFlow, flowDef);
        window.dispatchEvent(new Event('flow:saved'));
      } catch (error) {
        console.error('Auto-save failed:', error);
        window.dispatchEvent(new Event('flow:error'));
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, initialized, currentFlow, saveFlow, buildFlowDef]);

  const handleExportFlow = useCallback(() => {
    const flowDef = buildFlowDef();
    if (!flowDef || !currentFlow) return;

    const dataStr = JSON.stringify(flowDef, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentFlow}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [buildFlowDef, currentFlow]);

  const handleRunFlow = useCallback(() => {
    setExecutionDialogOpen(true);
  }, []);

  const handleManualSave = useCallback(async () => {
    if (!project || !currentFlow) return;

    window.dispatchEvent(new Event('flow:saving'));

    const flowDef = buildFlowDef();
    if (!flowDef) return;

    try {
      await saveFlow(currentFlow, flowDef);
      window.dispatchEvent(new Event('flow:saved'));
    } catch (error) {
      console.error('Manual save failed:', error);
      window.dispatchEvent(new Event('flow:error'));
      alert('保存失败: ' + (error as Error).message);
    }
  }, [buildFlowDef, project, currentFlow, saveFlow]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save
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
      <FlowToolbar
        onSave={handleManualSave}
        onExport={handleExportFlow}
        onRun={handleRunFlow}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        defaultEdgeOptions={defaultEdgeOptions}>
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'SignalIn') return '#22c55e';
              if (node.type === 'SignalOut') return '#3b82f6';
              return '#94a3b8';
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
          <PaneContextMenu
            menu={contextMenu}
            manifests={project?.nodeManifests || []}
            onClose={() => setContextMenu((m) => ({ ...m, open: false }))}
            onAddNode={addNodeAtPosition}
          />
      </ReactFlow>
      {currentFlow && (
        <ExecutionDialog
          open={executionDialogOpen}
          onOpenChange={setExecutionDialogOpen}
          flowId={currentFlow}
          flowMeta={project?.flows[currentFlow]?.meta}
        />
      )}
    </div>
  );
}
