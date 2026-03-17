/**
 * Shared DAG layout algorithm with declaration-order-aware back-edge filtering.
 * Used by both Flow editor and Session editor.
 */

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  gapX: number;
  gapY: number;
}

/**
 * Topological-sort-based auto layout with barycenter crossing reduction.
 * Arranges nodes left-to-right by layer, top-to-bottom within each layer.
 *
 * Uses declaration order (the order of `nodeIds`) to identify back edges —
 * edges where the target appears before or at the same position as the source.
 * Back edges are excluded from the topological sort so cycles don't break
 * the layer structure.
 *
 * After layering, applies barycenter heuristic to reorder nodes within each
 * layer, minimizing edge crossings by sorting nodes based on the average
 * position of their connected neighbors in the previous layer.
 *
 * Returns a map of node ID → position, plus a set of back-edge keys
 * ("source->target") for callers that want to style them differently.
 */
export function layoutDag(
  nodeIds: string[],
  edges: { source: string; target: string }[],
  opts: LayoutOptions,
): { positions: Map<string, { x: number; y: number }>; backEdges: Set<string> } {
  const positions = new Map<string, { x: number; y: number }>();
  const backEdges = new Set<string>();
  if (nodeIds.length === 0) return { positions, backEdges };

  const orderIndex = new Map(nodeIds.map((id, i) => [id, i]));
  const idSet = new Set(nodeIds);

  // Build adjacency + in-degree, skipping back edges
  const inDegree = new Map<string, number>();
  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    children.set(id, new Set());
    parents.set(id, new Set());
  }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    const srcIdx = orderIndex.get(e.source)!;
    const tgtIdx = orderIndex.get(e.target)!;
    if (tgtIdx <= srcIdx) {
      backEdges.add(`${e.source}->${e.target}`);
      continue;
    }
    children.get(e.source)!.add(e.target);
    parents.get(e.target)!.add(e.source);
    inDegree.set(e.target, inDegree.get(e.target)! + 1);
  }

  // BFS topological sort → layers
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

  // Orphan nodes
  for (const id of nodeIds) {
    if (!visited.has(id)) {
      layers.push([id]);
      visited.add(id);
    }
  }

  // Barycenter crossing reduction (2 passes: forward + backward)
  // Build a position index for the current layer ordering
  const layerIndex = new Map<string, number>();
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i++) {
      layerIndex.set(layer[i], i);
    }
  }

  // Forward pass: sort each layer by average parent position
  for (let col = 1; col < layers.length; col++) {
    layers[col].sort((a, b) => {
      const aParents = parents.get(a) ?? new Set();
      const bParents = parents.get(b) ?? new Set();
      const aAvg = avgPosition(aParents, layerIndex);
      const bAvg = avgPosition(bParents, layerIndex);
      if (aAvg !== bAvg) return aAvg - bAvg;
      // Tie-break: preserve declaration order
      return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
    });
    // Update index after reorder
    for (let i = 0; i < layers[col].length; i++) {
      layerIndex.set(layers[col][i], i);
    }
  }

  // Backward pass: sort each layer by average child position
  for (let col = layers.length - 2; col >= 0; col--) {
    layers[col].sort((a, b) => {
      const aChildren = children.get(a) ?? new Set();
      const bChildren = children.get(b) ?? new Set();
      const aAvg = avgPosition(aChildren, layerIndex);
      const bAvg = avgPosition(bChildren, layerIndex);
      if (aAvg !== bAvg) return aAvg - bAvg;
      return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
    });
    for (let i = 0; i < layers[col].length; i++) {
      layerIndex.set(layers[col][i], i);
    }
  }

  // Assign coordinates
  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col];
    const totalH = layer.length * opts.nodeHeight + (layer.length - 1) * opts.gapY;
    const startY = -totalH / 2;
    for (let row = 0; row < layer.length; row++) {
      positions.set(layer[row], {
        x: col * (opts.nodeWidth + opts.gapX),
        y: startY + row * (opts.nodeHeight + opts.gapY),
      });
    }
  }

  return { positions, backEdges };
}

/** Average position of a set of nodes in their layer, or Infinity if empty */
function avgPosition(nodeSet: Set<string>, layerIndex: Map<string, number>): number {
  if (nodeSet.size === 0) return Infinity;
  let sum = 0;
  for (const id of nodeSet) {
    sum += layerIndex.get(id) ?? 0;
  }
  return sum / nodeSet.size;
}
