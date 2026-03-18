import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Node,
  type Edge,
  type FitViewOptions,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnectStart,
  type DefaultEdgeOptions,
  Controls,
  MiniMap,
  MarkerType,
} from '@xyflow/react';

import { ManifestNode } from "./nodes/ManifestNode";
import { ElegantEdge } from "./edges/ElegantEdge";
import { PaneContextMenu, type ContextMenuState } from "./PaneContextMenu";
import { FlowToolbar } from "./components/FlowToolbar";
import { ExecutionDialog } from "./components/ExecutionDialog";
import { useFlowResource, useStudioCommands, useStudioResources } from "@/kernel/hooks";
import { useFlowNodeOverlay } from "@/hooks/use-node-overlay";
import { useCanvasSelection } from "@/hooks/use-canvas-selection";
import { elkLayout, detectBackEdges } from "@/utils/elk-layout";
import { AUTO_SAVE_DEBOUNCE_MS } from "@/constants/editor";
import { useTranslation } from "react-i18next";
import type { FlowDefinition, NodeDefinition, NodeManifest } from "@/types/project";

const ELK_FLOW_OPTS = { nodeWidth: 320, nodeHeight: 200, direction: 'RIGHT' as const };

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

const fitViewOptions: FitViewOptions = {
  padding: 100,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'elegant',
  animated: true,
  interactionWidth: 20,
};

const edgeTypes = {
  elegant: ElegantEdge,
};

/** Map a port type string to a stroke color for edges */
function edgeColorForType(portType?: string): string {
  if (!portType) return '#94a3b8';
  const t = portType.toLowerCase();
  if (t.includes('chatmessage') || t.includes('message')) return '#3b82f6'; // blue
  if (t === 'string' || t === 'string[]') return '#10b981'; // green
  if (t === 'number' || t === 'number[]' || t === 'integer') return '#f59e0b'; // amber
  if (t === 'boolean') return '#ef4444'; // red
  if (t === 'any' || t === 'unknown') return '#94a3b8'; // gray
  return '#8b5cf6'; // purple for other/custom types
}

function FlowInner() {
  const { project } = useStudioResources();
  const { flowId: currentFlow } = useFlowResource();
  const { saveFlow } = useStudioCommands();
  const overlayMap = useFlowNodeOverlay(currentFlow);
  const setSelection = useCanvasSelection((s) => s.setSelection);
  const selectedNodeId = useCanvasSelection((s) => s.selectedNodeId);
  const selectionContext = useCanvasSelection((s) => s.selectionContext);
  const { t } = useTranslation('flow');
  const reactFlowInstance = useReactFlow();

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      if (isLoadingRef.current && selected.length === 0 && selectionContext === 'flow' && selectedNodeId) {
        return;
      }
      setSelection(selected.length === 1 ? selected[0].id : null, 'flow');
    },
    [selectedNodeId, selectionContext, setSelection],
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
  const [layoutReady, setLayoutReady] = useState(false);
  const isLoadingRef = useRef(false);
  const needsInitialLayoutRef = useRef(false);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });

  // Track drag-connect origin for smart node suggestions
  const connectStartRef = useRef<{ nodeId: string; handleId: string | null; handleType: 'source' | 'target' } | null>(null);

  // Keep refs in sync so handleAutoLayout always reads fresh state
  nodesRef.current = nodes;
  edgesRef.current = edges;

  /** Shared: apply ELK back-edge styling to an edge list */
  const applyEdgeRouting = useCallback(
    (
      eds: Edge[],
      backEdges: Set<string>,
    ): Edge[] =>
      eds.map((edge) => {
        const edgeKey = `${edge.source}->${edge.target}`;
        if (backEdges.has(edgeKey)) {
          return {
            ...edge,
            type: 'smoothstep',
            zIndex: 1000,
            style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8 4' },
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
            label: t('cycle'),
            labelStyle: { fill: '#f59e0b', fontWeight: 600, fontSize: 12 },
          };
        }
        const { style: _s, label: _l, labelStyle: _ls, zIndex: _z, ...rest } = edge;
        return { ...rest, type: 'elegant', animated: true };
      }),
    [t],
  );

  // Load flow data only when switching flows (not on project save updates).
  const lastLoadedFlowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!project || !currentFlow || !project.flows[currentFlow]) {
      setInitialized(false);
      return;
    }

    // Skip if we already loaded this flow (project changed due to auto-save)
    if (lastLoadedFlowRef.current === currentFlow && initialized) return;
    lastLoadedFlowRef.current = currentFlow;

    const flowDef = project.flows[currentFlow];

    isLoadingRef.current = true;
    setLayoutReady(false);

    // Empty flow: no nodes to measure, skip two-phase layout
    if (flowDef.data.nodes.length === 0) {
      needsInitialLayoutRef.current = false;
      setNodes([]);
      setEdges([]);
      setInitialized(true);
      setLayoutReady(true);
      requestAnimationFrame(() => { isLoadingRef.current = false; });
      return;
    }

    needsInitialLayoutRef.current = true;

    const reactFlowNodes: Node[] = flowDef.data.nodes.map((node) => {
      const manifest = manifestMap.get(node.type);
      return {
        id: node.id,
        type: node.type,
        position: { x: 0, y: 0 },
        selected: selectionContext === 'flow' && selectedNodeId === node.id,
        data: {
          label: node.label || manifest?.label || node.type,
          manifest,
          config: { ...(manifest?.defaultConfig || {}), ...(node.config || {}) },
          inputs: node.inputs?.length ? node.inputs : manifest?.inputs || [],
          outputs: node.outputs?.length ? node.outputs : manifest?.outputs || [],
        },
      };
    });

    // Build base edges with type-based coloring
    const nodeOutputsMap = new Map<string, Array<{ name: string; type: string }>>();
    for (const node of flowDef.data.nodes) {
      const manifest = manifestMap.get(node.type);
      nodeOutputsMap.set(node.id, node.outputs?.length ? node.outputs : manifest?.outputs || []);
    }

    const baseEdges: Edge[] = flowDef.data.edges.map((edge, idx) => {
      const sourceOutputs = nodeOutputsMap.get(edge.source) ?? [];
      const sourcePort = edge.sourceHandle
        ? sourceOutputs.find((o) => o.name === edge.sourceHandle)
        : sourceOutputs[0];
      const color = edgeColorForType(sourcePort?.type);
      return {
        id: `e-${edge.source}-${edge.target}-${idx}`,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle,
        style: { stroke: color, strokeWidth: 2 },
      };
    });

    // Synchronously detect back edges for styling (no layout yet)
    const simpleEdges = flowDef.data.edges.map((e) => ({ source: e.source, target: e.target }));
    const backEdges = detectBackEdges(
      flowDef.data.nodes.map((n) => n.id),
      simpleEdges,
    );

    setNodes(reactFlowNodes);
    setEdges(applyEdgeRouting(baseEdges, backEdges));
    setInitialized(true);

    if (
      selectionContext === 'flow' &&
      selectedNodeId &&
      !flowDef.data.nodes.some((node) => node.id === selectedNodeId)
    ) {
      setSelection(null, 'flow');
    }
  }, [currentFlow, manifestMap, project, initialized, applyEdgeRouting, t, selectionContext, selectedNodeId, setSelection]);

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
      const newNodeId = `${nodeType}-${Date.now()}`;
      setNodes((nds) => [
        ...nds,
        {
          id: newNodeId,
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

      // Auto-connect if this was triggered by a drag-connect drop
      const origin = connectStartRef.current;
      if (origin) {
        const newInputs = manifest?.inputs || [];
        const newOutputs = manifest?.outputs || [];

        if (origin.handleType === 'source') {
          // Dragged from a source port → connect to the new node's first input
          const targetHandle = newInputs[0]?.name ?? null;
          setEdges((eds) =>
            addEdge(
              { source: origin.nodeId, sourceHandle: origin.handleId, target: newNodeId, targetHandle },
              eds,
            ),
          );
        } else {
          // Dragged from a target port → connect from the new node's first output
          const sourceHandle = newOutputs[0]?.name ?? null;
          setEdges((eds) =>
            addEdge(
              { source: newNodeId, sourceHandle, target: origin.nodeId, targetHandle: origin.handleId },
              eds,
            ),
          );
        }
        connectStartRef.current = null;
      }
    },
    [manifestMap],
  );

  const onConnectStart: OnConnectStart = useCallback(
    (_event, params) => {
      connectStartRef.current = {
        nodeId: params.nodeId ?? '',
        handleId: params.handleId ?? null,
        handleType: params.handleType ?? 'source',
      };
    },
    [],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Only trigger if the connection was dropped on the pane (not on a node handle)
      const target = event.target as HTMLElement;
      if (!target?.classList?.contains('react-flow__pane') && !target?.closest('.react-flow__pane')) {
        connectStartRef.current = null;
        return;
      }

      // Get the drop position
      const clientPos = 'changedTouches' in event
        ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
        : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };

      // Open context menu at drop position (connectStartRef is still set, addNodeAtPosition will use it)
      setContextMenu({
        open: true,
        x: clientPos.x,
        y: clientPos.y,
      });
    },
    [],
  );

  const handleAutoLayout = useCallback(async () => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const nodeIds = currentNodes.map((n) => n.id);
    const simpleEdges = currentEdges.map((e) => ({ source: e.source, target: e.target }));

    // Build node size map from actual rendered dimensions
    const nodeSizes = new Map<string, { width: number; height: number }>();
    for (const node of currentNodes) {
      const width = node.measured?.width ?? node.width ?? 320;
      const height = node.measured?.height ?? node.height ?? 200;
      nodeSizes.set(node.id, { width, height });
    }

    const { positions, backEdges } = await elkLayout(nodeIds, simpleEdges, ELK_FLOW_OPTS, nodeSizes);
    setNodes((nds) =>
      nds.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
    );
    setEdges((eds) => applyEdgeRouting(eds, backEdges));
    requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.15, duration: 300 }));
  }, [reactFlowInstance, applyEdgeRouting]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));

      // Detect when React Flow has measured all node dimensions after initial render
      if (needsInitialLayoutRef.current) {
        const hasDimensionChange = changes.some(
          (c) => c.type === 'dimensions' && c.dimensions,
        );
        if (hasDimensionChange) {
          requestAnimationFrame(() => {
            if (needsInitialLayoutRef.current) {
              needsInitialLayoutRef.current = false;
              handleAutoLayout().then(() => {
                setLayoutReady(true);
                requestAnimationFrame(() => {
                  isLoadingRef.current = false;
                });
              });
            }
          });
        }
      }
    },
    [handleAutoLayout],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((eds) => {
        const nextEdges = addEdge(connection, eds);
        // Re-detect back edges after new connection
        const nodeIds = nodes.map((n) => n.id);
        const simpleEdges = nextEdges.map((e) => ({ source: e.source, target: e.target }));
        const backEdges = detectBackEdges(nodeIds, simpleEdges);

        return nextEdges.map((edge) => {
          const isBack = backEdges.has(`${edge.source}->${edge.target}`);
          if (isBack) {
            return {
              ...edge,
              type: 'smoothstep',
              zIndex: 1000,
              style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8 4' },
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
              label: t('cycle'),
              labelStyle: { fill: '#f59e0b', fontWeight: 600, fontSize: 12 },
            };
          }
          // Preserve existing style for non-back edges, apply type-based color for new ones
          if (!edge.style?.stroke || edge.style.stroke === '#f59e0b') {
            const sourceOutputs = (() => {
              const nodeData = nodes.find((n) => n.id === edge.source)?.data as { outputs?: Array<{ name: string; type: string }> } | undefined;
              return nodeData?.outputs ?? [];
            })();
            const sourcePort = edge.sourceHandle
              ? sourceOutputs.find((o) => o.name === edge.sourceHandle)
              : sourceOutputs[0];
            const color = edgeColorForType(sourcePort?.type);
            return { ...edge, type: 'elegant', style: { stroke: color, strokeWidth: 2 }, label: undefined, labelStyle: undefined, markerEnd: undefined };
          }
          return edge;
        });
      });
    },
    [setEdges, nodes, t],
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
    }, AUTO_SAVE_DEBOUNCE_MS);

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
      alert(t('saveFailed', { message: (error as Error).message }));
    }
  }, [buildFlowDef, project, currentFlow, saveFlow]);

  // Keyboard shortcuts
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + S to save
      if (mod && e.key === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }

      // Ctrl/Cmd + Enter to run
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        setExecutionDialogOpen(true);
        return;
      }

      // Ctrl/Cmd + D to duplicate selected nodes
      if (mod && e.key === 'd') {
        e.preventDefault();
        const selected = nodes.filter((n) => n.selected);
        if (selected.length === 0) return;
        const newNodes = selected.map((n) => ({
          ...n,
          id: `${n.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          selected: false,
        }));
        setNodes((nds) => [...nds, ...newNodes]);
        return;
      }

      // Skip single-key shortcuts when inside editable fields
      if (isEditable(e.target)) return;

      // F to fit view
      if (e.key === 'f' && !mod && !e.shiftKey) {
        e.preventDefault();
        reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
        return;
      }

      // Tab to open add-node context menu at center of viewport
      if (e.key === 'Tab' && !mod) {
        e.preventDefault();
        const vp = document.querySelector('.react-flow');
        if (vp) {
          const rect = vp.getBoundingClientRect();
          setContextMenu({
            open: true,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave, nodes, reactFlowInstance]);

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
    <div className="relative h-full w-full" style={{ opacity: layoutReady ? 1 : 0, transition: 'opacity 0.15s ease-in' }}>
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
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        defaultEdgeOptions={defaultEdgeOptions}>
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const manifest = manifestMap.get(node.type ?? '');
              switch (manifest?.category) {
                case 'signal': return '#38bdf8';
                case 'state': return '#34d399';
                case 'llm': return '#fbbf24';
                case 'transform': return '#e879f9';
                case 'utility': return '#94a3b8';
                default: return '#cbd5e1';
              }
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

export default function Flow() {
  return (
    <ReactFlowProvider>
      <FlowInner />
    </ReactFlowProvider>
  );
}
