/**
 * useGraphEditor — shared editor shell for Flow and Session canvases.
 *
 * Extracts the common two-phase rendering pipeline (place at origin → measure →
 * ELK layout → fitView), debounced auto-save, manual save, and node/edge change
 * handlers that were duplicated between Flow.tsx and SessionEditor.tsx.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import { elkLayout } from '@/utils/elk-layout';
import { AUTO_SAVE_DEBOUNCE_MS } from '@/constants/editor';
import type { ElkLayoutOptions } from '@/utils/elk-layout';

export type UseGraphEditorOptions = {
  elkOptions: ElkLayoutOptions;
  /**
   * Called after auto-save debounce or manual save.
   * The hook does NOT call this during initial load.
   */
  onSave: (nodes: Node[], edges: Edge[]) => Promise<void>;
  autoSaveDebounceMs?: number;
  /**
   * Optional post-layout edge transform (e.g. back-edge styling).
   * Receives edges and the back-edge set from ELK, returns styled edges.
   */
  postLayoutEdges?: (edges: Edge[], backEdges: Set<string>) => Edge[];
};

export type UseGraphEditorReturn = {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /** False until the initial ELK layout completes — hide canvas until true */
  layoutReady: boolean;
  /** True between loadGraph() and layout completion — suppress selection clear */
  isLoading: boolean;
  initialized: boolean;
  setInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  handleAutoLayout: () => Promise<void>;
  handleManualSave: () => Promise<void>;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  /**
   * Load a new graph into the editor. Triggers the two-phase layout pipeline.
   * Pass `null` to clear the canvas.
   */
  loadGraph: (data: { nodes: Node[]; edges: Edge[] } | null) => void;
};

export function useGraphEditor(options: UseGraphEditorOptions): UseGraphEditorReturn {
  const {
    elkOptions,
    onSave,
    autoSaveDebounceMs = AUTO_SAVE_DEBOUNCE_MS,
    postLayoutEdges,
  } = options;

  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);

  const isLoadingRef = useRef(false);
  const needsInitialLayoutRef = useRef(false);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  // Keep refs in sync so handleAutoLayout always reads fresh state
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // ── Two-phase layout ──

  const handleAutoLayout = useCallback(async () => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const nodeIds = currentNodes.map((n) => n.id);
    const simpleEdges = currentEdges.map((e) => ({ source: e.source, target: e.target }));

    const nodeSizes = new Map<string, { width: number; height: number }>();
    for (const node of currentNodes) {
      const width = node.measured?.width ?? node.width ?? elkOptions.nodeWidth;
      const height = node.measured?.height ?? node.height ?? elkOptions.nodeHeight;
      nodeSizes.set(node.id, { width, height });
    }

    const { positions, backEdges } = await elkLayout(nodeIds, simpleEdges, elkOptions, nodeSizes);
    setNodes((nds) =>
      nds.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
    );
    if (postLayoutEdges) {
      setEdges((eds) => postLayoutEdges(eds, backEdges));
    }
    requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.15, duration: 300 }));
  }, [reactFlowInstance, elkOptions, postLayoutEdges]);

  // ── Node/Edge change handlers ──

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
    [],
  );

  // ── Auto-save ──

  useEffect(() => {
    if (!initialized) return;
    if (isLoadingRef.current) return;

    const timeoutId = setTimeout(async () => {
      try {
        await onSave(nodesRef.current, edgesRef.current);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, autoSaveDebounceMs);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, initialized, onSave, autoSaveDebounceMs]);

  // ── Manual save ──

  const handleManualSave = useCallback(async () => {
    await onSave(nodesRef.current, edgesRef.current);
  }, [onSave]);

  // ── Load graph ──

  const loadGraph = useCallback((data: { nodes: Node[]; edges: Edge[] } | null) => {
    if (!data) {
      setNodes([]);
      setEdges([]);
      setInitialized(false);
      setLayoutReady(true);
      return;
    }

    isLoadingRef.current = true;
    setLayoutReady(false);

    if (data.nodes.length === 0) {
      needsInitialLayoutRef.current = false;
      setNodes([]);
      setEdges(data.edges);
      setInitialized(true);
      setLayoutReady(true);
      requestAnimationFrame(() => { isLoadingRef.current = false; });
      return;
    }

    needsInitialLayoutRef.current = true;
    setNodes(data.nodes);
    setEdges(data.edges);
    setInitialized(true);
  }, []);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    layoutReady,
    isLoading: isLoadingRef.current,
    initialized,
    setInitialized,
    handleAutoLayout,
    handleManualSave,
    onNodesChange,
    onEdgesChange,
    loadGraph,
  };
}
