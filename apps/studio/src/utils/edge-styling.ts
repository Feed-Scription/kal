/**
 * Unified back-edge styling constants and helpers.
 *
 * Back edges (cycle edges detected by DFS) share a consistent visual treatment
 * across Flow and Session editors: amber dashed stroke, smoothstep routing,
 * high z-index, and a "cycle" label.
 */
import { MarkerType, type Edge } from '@xyflow/react';

export const BACK_EDGE_STYLE = {
  type: 'smoothstep' as const,
  zIndex: 1000,
  style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8 4' },
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
  labelStyle: { fill: '#f59e0b', fontWeight: 600, fontSize: 12 },
} as const;

/**
 * Apply back-edge visual treatment to a single edge if it belongs to the
 * back-edge set. Returns the original edge unchanged if it's not a back edge.
 */
export function applyBackEdgeStyle(
  edge: Edge,
  backEdges: Set<string>,
  cycleLabel: string,
): Edge {
  const key = `${edge.source}->${edge.target}`;
  if (!backEdges.has(key)) return edge;

  return {
    ...edge,
    ...BACK_EDGE_STYLE,
    label: cycleLabel,
  };
}

/**
 * Apply back-edge routing to an entire edge list.
 *
 * Back edges get the unified amber dashed style; forward edges are reset to
 * the default `elegant` type with animation. This is the shared replacement
 * for the per-editor `applyEdgeRouting` callbacks.
 */
export function applyEdgeRouting(
  edges: Edge[],
  backEdges: Set<string>,
  cycleLabel: string,
): Edge[] {
  return edges.map((edge) => {
    const key = `${edge.source}->${edge.target}`;
    if (backEdges.has(key)) {
      return {
        ...edge,
        ...BACK_EDGE_STYLE,
        label: cycleLabel,
      };
    }
    // Forward edge: strip any leftover back-edge styling
    const { style: _s, label: _l, labelStyle: _ls, zIndex: _z, ...rest } = edge;
    return { ...rest, type: 'elegant', animated: true };
  });
}
