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
 * Topological-sort-based auto layout.
 * Arranges nodes left-to-right by layer, top-to-bottom within each layer.
 *
 * Uses declaration order (the order of `nodeIds`) to identify back edges —
 * edges where the target appears before or at the same position as the source.
 * Back edges are excluded from the topological sort so cycles don't break
 * the layer structure.
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
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    children.set(id, new Set());
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
