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
  MarkerType,
} from '@xyflow/react';

import { ManifestNode } from "./nodes/ManifestNode";
import { PaneContextMenu, type ContextMenuState } from "./PaneContextMenu";
import { FlowToolbar } from "./components/FlowToolbar";
import { ExecutionDialog } from "./components/ExecutionDialog";
import { useFlowResource, useStudioCommands, useStudioResources } from "@/kernel/hooks";
import { useFlowNodeOverlay } from "@/hooks/use-node-overlay";
import { useCanvasSelection } from "@/hooks/use-canvas-selection";
import { layoutDag } from "@/utils/graph-layout";
import type { FlowDefinition, NodeDefinition, EdgeDefinition, NodeManifest } from "@/types/project";

const FLOW_LAYOUT = { nodeWidth: 320, nodeHeight: 200, gapX: 80, gapY: 40 };

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  additionalProperties?: boolean | Schema;
};

function sanitizeConfigWithSchema(value: unknown, schema?: Schema): unknown {
  if (!schema || value === null || value === undefined) {
    return value;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) return value;
    return schema.items ? value.map((item) => sanitizeConfigWithSchema(item, schema.items)) : value;
  }

  if (schema.type !== "object" || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const properties = schema.properties ?? {};
  const result: Record<string, unknown> = {};

  if (schema.additionalProperties === false) {
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in record) {
        result[key] = sanitizeConfigWithSchema(record[key], childSchema);
      }
    }
    return result;
  }

  for (const [key, childValue] of Object.entries(record)) {
    const childSchema = properties[key];
    if (childSchema) {
      result[key] = sanitizeConfigWithSchema(childValue, childSchema);
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      result[key] = sanitizeConfigWithSchema(childValue, schema.additionalProperties);
    } else {
      result[key] = childValue;
    }
  }

  return result;
}

function autoLayout(
  nodes: NodeDefinition[],
  edges: EdgeDefinition[],
): { positions: Map<string, { x: number; y: number }>; backEdges: Set<string> } {
  if (nodes.length === 0) return { positions: new Map(), backEdges: new Set() };

  // Always compute backEdges for visual differentiation
  const result = layoutDag(
    nodes.map((n) => n.id),
    edges,
    FLOW_LAYOUT,
  );

  // Determine whether to apply computed positions:
  // Skip layout if all nodes already have valid, distinct positions
  const withPos = nodes.filter((n) => n.position);
  if (withPos.length === nodes.length && nodes.length > 1) {
    const allSame = withPos.every(
      (n) => n.position!.x === withPos[0].position!.x && n.position!.y === withPos[0].position!.y,
    );
    if (!allSame) {
      // Positions are valid and distinct — keep them, but still return backEdges
      return { positions: new Map(), backEdges: result.backEdges };
    }
  } else if (withPos.length === nodes.length) {
    return { positions: new Map(), backEdges: result.backEdges };
  }

  return result;
}

const fitViewOptions: FitViewOptions = {
  padding: 100,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
};

export default function Flow() {
  const { project } = useStudioResources();
  const { flowId: currentFlow } = useFlowResource();
  const { saveFlow } = useStudioCommands();
  const overlayMap = useFlowNodeOverlay(currentFlow);
  const setSelection = useCanvasSelection((s) => s.setSelection);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      setSelection(selected.length === 1 ? selected[0].id : null, 'flow');
    },
    [setSelection],
  );

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

      const { positions: layoutPositions, backEdges } = autoLayout(flowDef.data.nodes, flowDef.data.edges);

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

      const reactFlowEdges: Edge[] = flowDef.data.edges.map((edge, idx) => {
        const base: Edge = {
          id: `e-${edge.source}-${edge.target}-${idx}`,
          source: edge.source,
          sourceHandle: edge.sourceHandle,
          target: edge.target,
          targetHandle: edge.targetHandle,
        };
        const isBack = backEdges.has(`${edge.source}->${edge.target}`);
        if (isBack) {
          return {
            ...base,
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
        return base;
      });

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
        nodes: nodes.map((node) => {
          const nodeData = node.data as {
            label?: string;
            config?: Record<string, unknown>;
            inputs?: NodeDefinition['inputs'];
            outputs?: NodeDefinition['outputs'];
            manifest?: NodeManifest;
          };

          return {
            id: node.id,
            type: node.type || 'default',
            label: String(nodeData.label || node.type || 'Node'),
            position: node.position,
            inputs: Array.isArray(nodeData.inputs) ? nodeData.inputs : [],
            outputs: Array.isArray(nodeData.outputs) ? nodeData.outputs : [],
            config: (sanitizeConfigWithSchema(
              nodeData.config || {},
              nodeData.manifest?.configSchema as Schema | undefined,
            ) as Record<string, unknown>) || {},
          };
        }),
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
      const flowDef = buildFlowDef();
      if (!flowDef) return;

      try {
        await saveFlow(currentFlow, flowDef);
      } catch (error) {
        console.error('Auto-save failed:', error);
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

    const flowDef = buildFlowDef();
    if (!flowDef) return;

    try {
      await saveFlow(currentFlow, flowDef);
    } catch (error) {
      console.error('Manual save failed:', error);
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

  const handleAutoLayout = useCallback(() => {
    const nodeIds = nodes.map((n) => n.id);
    const simpleEdges = edges.map((e) => ({ source: e.source, target: e.target }));
    const { positions, backEdges } = layoutDag(nodeIds, simpleEdges, FLOW_LAYOUT);
    setNodes((nds) =>
      nds.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
    );
    // Re-apply back-edge styling after layout
    setEdges((eds) =>
      eds.map((edge) => {
        const isBack = backEdges.has(`${edge.source}->${edge.target}`);
        if (isBack) {
          return {
            ...edge,
            type: 'smoothstep',
            style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8 4' },
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
            label: '循环',
            labelStyle: { fill: '#f59e0b', fontWeight: 600, fontSize: 12 },
          };
        }
        // Reset non-back edges to default
        const { type: _t, style: _s, label: _l, labelStyle: _ls, ...rest } = edge;
        return { ...rest, animated: true };
      }),
    );
  }, [nodes, edges]);

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
      <FlowToolbar
        onSave={handleManualSave}
        onExport={handleExportFlow}
        onRun={handleRunFlow}
        onAutoLayout={handleAutoLayout}
      />
      <ReactFlow
        nodes={nodesWithOverlay}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
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
