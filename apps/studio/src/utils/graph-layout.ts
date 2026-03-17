/**
 * Shared DAG layout algorithm with cycle-aware back-edge filtering.
 * Used by both Flow editor and Session editor.
 */

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  gapX: number;
  gapY: number;
}

export function layoutDag(
  nodeIds: string[],
  edges: { source: string; target: string }[],
  opts: LayoutOptions,
): { positions: Map<string, { x: number; y: number }>; backEdges: Set<string> } {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodeIds.length === 0) {
    return { positions, backEdges: new Set() };
  }

  const orderIndex = new Map(nodeIds.map((id, index) => [id, index]));
  const idSet = new Set(nodeIds);
  const backEdges = new Set<string>();
  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  const backTargets = new Map<string, Set<string>>();
  const backSources = new Map<string, Set<string>>();
  const outgoing = new Map<string, string[]>();

  for (const nodeId of nodeIds) {
    children.set(nodeId, new Set());
    parents.set(nodeId, new Set());
    backTargets.set(nodeId, new Set());
    backSources.set(nodeId, new Set());
    outgoing.set(nodeId, []);
  }

  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) {
      continue;
    }
    outgoing.get(edge.source)!.push(edge.target);
  }

  for (const [source, targets] of outgoing) {
    targets.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
    const seenTargets = new Set<string>();
    outgoing.set(
      source,
      targets.filter((target) => {
        if (seenTargets.has(target)) {
          return false;
        }
        seenTargets.add(target);
        return true;
      }),
    );
  }

  const addForwardEdge = (source: string, target: string) => {
    children.get(source)!.add(target);
    parents.get(target)!.add(source);
  };

  const addBackEdge = (source: string, target: string) => {
    const key = `${source}->${target}`;
    if (backEdges.has(key)) {
      return;
    }
    backEdges.add(key);
    backTargets.get(source)!.add(target);
    backSources.get(target)!.add(source);
  };

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visitNode = (nodeId: string) => {
    visiting.add(nodeId);
    visited.add(nodeId);

    for (const target of outgoing.get(nodeId) ?? []) {
      if (target === nodeId || visiting.has(target)) {
        addBackEdge(nodeId, target);
        continue;
      }

      if (!visited.has(target)) {
        visitNode(target);
      }

      if (!backEdges.has(`${nodeId}->${target}`)) {
        addForwardEdge(nodeId, target);
      }
    }

    visiting.delete(nodeId);
  };

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      visitNode(nodeId);
    }
  }

  const inDegree = new Map<string, number>();
  for (const nodeId of nodeIds) {
    inDegree.set(nodeId, parents.get(nodeId)?.size ?? 0);
  }

  const topoOrder: string[] = [];
  const queue = [...nodeIds]
    .filter((nodeId) => (inDegree.get(nodeId) ?? 0) === 0)
    .sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));

  while (queue.length > 0) {
    const current = queue.shift()!;
    topoOrder.push(current);

    const sortedChildren = [...(children.get(current) ?? [])].sort(
      (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0),
    );

    for (const child of sortedChildren) {
      const nextDegree = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, nextDegree);
      if (nextDegree === 0) {
        queue.push(child);
        queue.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
      }
    }
  }

  const topoSet = new Set(topoOrder);
  for (const nodeId of nodeIds) {
    if (!topoSet.has(nodeId)) {
      topoOrder.push(nodeId);
    }
  }

  const layerByNode = new Map<string, number>();
  let maxLayer = 0;

  for (const nodeId of topoOrder) {
    const layer = Math.max(
      0,
      ...[...(parents.get(nodeId) ?? [])].map((parentId) => (layerByNode.get(parentId) ?? 0) + 1),
    );
    layerByNode.set(nodeId, layer);
    maxLayer = Math.max(maxLayer, layer);
  }

  const layers = Array.from({ length: maxLayer + 1 }, () => [] as string[]);
  for (const nodeId of topoOrder) {
    layers[layerByNode.get(nodeId) ?? 0].push(nodeId);
  }

  const layerIndex = new Map<string, number>();
  const refreshLayerIndex = () => {
    layerIndex.clear();
    for (const layer of layers) {
      for (let index = 0; index < layer.length; index++) {
        layerIndex.set(layer[index], index);
      }
    }
  };

  refreshLayerIndex();

  for (let pass = 0; pass < 4; pass++) {
    for (let col = 1; col < layers.length; col++) {
      layers[col].sort((a, b) => {
        const aScore = weightedPosition(parents.get(a), backTargets.get(a), layerIndex);
        const bScore = weightedPosition(parents.get(b), backTargets.get(b), layerIndex);
        if (aScore !== bScore) {
          return aScore - bScore;
        }
        return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
      });
      refreshLayerIndex();
    }

    for (let col = layers.length - 2; col >= 0; col--) {
      layers[col].sort((a, b) => {
        const aScore = weightedPosition(children.get(a), backSources.get(a), layerIndex);
        const bScore = weightedPosition(children.get(b), backSources.get(b), layerIndex);
        if (aScore !== bScore) {
          return aScore - bScore;
        }
        return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
      });
      refreshLayerIndex();
    }
  }

  const horizontalStride =
    opts.nodeWidth + opts.gapX + Math.max(24, Math.round(opts.nodeWidth * 0.08));
  const verticalStride =
    opts.nodeHeight + opts.gapY + Math.max(24, Math.round(opts.nodeHeight * 0.12));

  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col];
    const totalH = layer.length === 0 ? 0 : opts.nodeHeight + (layer.length - 1) * verticalStride;
    const startY = -totalH / 2;

    for (let row = 0; row < layer.length; row++) {
      positions.set(layer[row], {
        x: col * horizontalStride,
        y: startY + row * verticalStride,
      });
    }
  }

  return { positions, backEdges };
}

function weightedPosition(
  primaryNodes: Set<string> | undefined,
  secondaryNodes: Set<string> | undefined,
  layerIndex: Map<string, number>,
): number {
  const primaryWeight = 1;
  const secondaryWeight = 0.35;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const nodeId of primaryNodes ?? []) {
    weightedSum += (layerIndex.get(nodeId) ?? 0) * primaryWeight;
    totalWeight += primaryWeight;
  }

  for (const nodeId of secondaryNodes ?? []) {
    weightedSum += (layerIndex.get(nodeId) ?? 0) * secondaryWeight;
    totalWeight += secondaryWeight;
  }

  if (totalWeight === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return weightedSum / totalWeight;
}
