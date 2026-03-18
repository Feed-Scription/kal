/**
 * ELK-based graph layout with orthogonal edge routing.
 *
 * Uses Eclipse Layout Kernel (elkjs) for industrial-grade Sugiyama layered
 * layout with proper edge routing that avoids node overlap.
 */
import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk-api.js';

export interface ElkLayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  direction?: 'RIGHT' | 'DOWN';
}

const elk = new ELK({
  workerUrl: new URL('elkjs/lib/elk-worker.min.js', import.meta.url).href,
});

/**
 * Compute layout positions using ELK's layered algorithm.
 *
 * Returns node positions and a set of back-edge keys (`source->target`)
 * detected via DFS cycle detection.
 */
export async function elkLayout(
  nodeIds: string[],
  edges: { source: string; target: string }[],
  opts: ElkLayoutOptions,
): Promise<{ positions: Map<string, { x: number; y: number }>; backEdges: Set<string> }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (nodeIds.length === 0) {
    return { positions, backEdges: new Set() };
  }

  const idSet = new Set(nodeIds);

  const elkNodes: ElkNode[] = nodeIds.map((id) => ({
    id,
    width: opts.nodeWidth,
    height: opts.nodeHeight,
  }));

  const validEdges = edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));

  const elkEdges: ElkExtendedEdge[] = validEdges.map((e, i) => ({
    id: `e-${i}`,
    sources: [e.source],
    targets: [e.target],
  }));

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': opts.direction ?? 'RIGHT',
      // Orthogonal = right-angle lines that route around nodes
      'elk.edgeRouting': 'ORTHOGONAL',
      // Cycle handling
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      // Node placement
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      // Spacing — generous to avoid overlap
      'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.round(opts.nodeWidth * 0.4)),
      'elk.layered.spacing.edgeNodeBetweenLayers': '30',
      'elk.spacing.nodeNode': '40',
      'elk.spacing.edgeNode': '25',
      'elk.spacing.edgeEdge': '15',
      // Minimize edge crossings
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // Merge edges going to the same target for cleaner look
      'elk.layered.mergeEdges': 'true',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const result = await elk.layout(graph);

  for (const child of result.children ?? []) {
    if (child.x !== undefined && child.y !== undefined) {
      positions.set(child.id, { x: child.x, y: child.y });
    }
  }

  const backEdges = detectBackEdges(nodeIds, validEdges);

  return { positions, backEdges };
}

/**
 * Lightweight synchronous DFS cycle detection.
 * Used by onConnect to instantly detect back edges without a full layout pass.
 */
export function detectBackEdges(
  nodeIds: string[],
  edges: { source: string; target: string }[],
): Set<string> {
  const backEdges = new Set<string>();
  const idSet = new Set(nodeIds);
  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) outgoing.set(id, []);
  for (const e of edges) {
    if (idSet.has(e.source) && idSet.has(e.target)) {
      outgoing.get(e.source)!.push(e.target);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (nodeId: string) => {
    visiting.add(nodeId);
    visited.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visiting.has(target)) {
        backEdges.add(`${nodeId}->${target}`);
      } else if (!visited.has(target)) {
        dfs(target);
      }
    }
    visiting.delete(nodeId);
  };

  for (const id of nodeIds) {
    if (!visited.has(id)) dfs(id);
  }

  return backEdges;
}
