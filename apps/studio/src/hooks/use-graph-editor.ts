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
  type OnMove,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import { elkLayout } from '@/utils/elk-layout';
import { AUTO_SAVE_DEBOUNCE_MS } from '@/constants/editor';
import type { ElkLayoutOptions } from '@/utils/elk-layout';
import type { CanvasViewport } from '@/types/project';

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
  savedViewport?: CanvasViewport | null;
  onViewportChange?: (viewport: CanvasViewport) => void;
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
  onMoveEnd: OnMove;
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
    savedViewport = null,
    onViewportChange,
  } = options;

  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const needsInitialLayoutRef = useRef(false);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const savedViewportRef = useRef<CanvasViewport | null>(savedViewport);
  const onViewportChangeRef = useRef<typeof onViewportChange>(onViewportChange);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  useEffect(() => {
    savedViewportRef.current = savedViewport;
    onViewportChangeRef.current = onViewportChange;
  }, [savedViewport, onViewportChange]);

  // ── Two-phase layout ──

  const persistViewport = useCallback((viewport?: CanvasViewport | null) => {
    if (!viewport) return;
    onViewportChangeRef.current?.(viewport);
  }, []);

  const snapshotViewport = useCallback(() => {
    const { x, y, zoom } = reactFlowInstance.getViewport();
    persistViewport({ x, y, zoom });
  }, [persistViewport, reactFlowInstance]);

  const runLayout = useCallback(async (preserveViewport: boolean) => {
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
    requestAnimationFrame(() => {
      const viewport = preserveViewport ? savedViewportRef.current : null;
      if (viewport) {
        void reactFlowInstance.setViewport(viewport, { duration: 0 }).finally(() => {
          persistViewport(viewport);
        });
        return;
      }

      void reactFlowInstance.fitView({ padding: 0.15, duration: 300 }).finally(() => {
        snapshotViewport();
      });
    });
  }, [reactFlowInstance, elkOptions, postLayoutEdges, persistViewport, snapshotViewport]);

  const handleAutoLayout = useCallback(async () => {
    await runLayout(false);
  }, [runLayout]);

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
              runLayout(true).then(() => {
                setLayoutReady(true);
                requestAnimationFrame(() => {
                  setIsLoading(false);
                });
              });
            }
          });
        }
      }
    },
    [runLayout],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  // ── Auto-save ──

  useEffect(() => {
    if (!initialized) return;
    if (isLoading) return;

    const timeoutId = setTimeout(async () => {
      try {
        await onSave(nodesRef.current, edgesRef.current);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, autoSaveDebounceMs);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, initialized, isLoading, onSave, autoSaveDebounceMs]);

  // ── Manual save ──

  const handleManualSave = useCallback(async () => {
    await onSave(nodesRef.current, edgesRef.current);
  }, [onSave]);

  const onMoveEnd: OnMove = useCallback((_event, viewport) => {
    persistViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
  }, [persistViewport]);

  // ── Load graph ──

  const loadGraph = useCallback((data: { nodes: Node[]; edges: Edge[] } | null) => {
    if (!data) {
      setNodes([]);
      setEdges([]);
      setInitialized(false);
      setLayoutReady(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLayoutReady(false);

    if (data.nodes.length === 0) {
      needsInitialLayoutRef.current = false;
      setNodes([]);
      setEdges(data.edges);
      setInitialized(true);
      setLayoutReady(true);
      requestAnimationFrame(() => { setIsLoading(false); });
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
    isLoading,
    initialized,
    setInitialized,
    handleAutoLayout,
    handleManualSave,
    onMoveEnd,
    onNodesChange,
    onEdgesChange,
    loadGraph,
  };
}
