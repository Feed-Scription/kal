/**
 * ElegantEdge — obstacle-aware smooth edge routing.
 *
 * For each edge, checks if the straight-line path between source and target
 * would pass through any intermediate node. If so, routes around the obstacle
 * with a rounded orthogonal detour. Otherwise draws the adaptive cubic bezier.
 *
 * When `data.route` is provided (from ELK auto-layout), uses those waypoints
 * directly for maximum accuracy.
 */
import { BaseEdge, useReactFlow, type EdgeProps } from '@xyflow/react';

/** Padding around node bounding boxes for obstacle detection */
const OBSTACLE_PAD = 20;
/** Radius for rounding corners on routed polylines */
const CORNER_RADIUS = 8;

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

/**
 * Build a rounded-corner polyline SVG path from an array of waypoints.
 */
function roundedPolyline(points: Pt[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dNext = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (dPrev === 0 || dNext === 0) {
      parts.push(`L ${curr.x} ${curr.y}`);
      continue;
    }
    const r = Math.min(CORNER_RADIUS, dPrev / 2, dNext / 2);

    const ux1 = (prev.x - curr.x) / dPrev;
    const uy1 = (prev.y - curr.y) / dPrev;
    const ux2 = (next.x - curr.x) / dNext;
    const uy2 = (next.y - curr.y) / dNext;

    const ax = curr.x + ux1 * r;
    const ay = curr.y + uy1 * r;
    const bx = curr.x + ux2 * r;
    const by = curr.y + uy2 * r;

    const cross = ux1 * uy2 - uy1 * ux2;
    const sweep = cross > 0 ? 0 : 1;

    parts.push(`L ${ax} ${ay}`);
    parts.push(`A ${r} ${r} 0 0 ${sweep} ${bx} ${by}`);
  }

  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);

  return parts.join(' ');
}

/**
 * Check if a line segment from p1 to p2 intersects a rectangle (with padding).
 * Uses Liang-Barsky algorithm.
 */
function segmentIntersectsRect(p1: Pt, p2: Pt, rect: Rect, pad: number): boolean {
  const xmin = rect.x - pad;
  const xmax = rect.x + rect.w + pad;
  const ymin = rect.y - pad;
  const ymax = rect.y + rect.h + pad;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - xmin, xmax - p1.x, p1.y - ymin, ymax - p1.y];

  let u1 = 0;
  let u2 = 1;

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > u2) return false;
        if (t > u1) u1 = t;
      } else {
        if (t < u1) return false;
        if (t < u2) u2 = t;
      }
    }
  }

  return u1 < u2;
}

/**
 * Find nodes whose bounding boxes sit between source and target and would
 * be intersected by a straight line between them.
 */
function findObstacles(
  source: Pt,
  target: Pt,
  sourceId: string,
  targetId: string,
  nodeRects: Array<{ id: string; rect: Rect }>,
): Array<{ id: string; rect: Rect }> {
  return nodeRects.filter(({ id, rect }) => {
    if (id === sourceId || id === targetId) return false;
    return segmentIntersectsRect(source, target, rect, 2);
  });
}

/**
 * Route around obstacles by going above or below them.
 * Returns waypoints for a rounded polyline path.
 */
function routeAroundObstacles(
  source: Pt,
  target: Pt,
  obstacles: Array<{ rect: Rect }>,
): Pt[] {
  if (obstacles.length === 0) return [source, target];

  // Compute the combined bounding box of all obstacles
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { rect } of obstacles) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }

  // Decide whether to route above or below the obstacle cluster
  const midY = (source.y + target.y) / 2;
  const obstacleMidY = (minY + maxY) / 2;

  // Route on the side that's closer to the edge endpoints
  const goAbove = midY <= obstacleMidY;
  const detourY = goAbove
    ? minY - OBSTACLE_PAD
    : maxY + OBSTACLE_PAD;

  // Horizontal entry/exit points: just before and after the obstacle cluster
  const entryX = minX - OBSTACLE_PAD;
  const exitX = maxX + OBSTACLE_PAD;

  return [
    source,
    { x: entryX, y: source.y },
    { x: entryX, y: detourY },
    { x: exitX, y: detourY },
    { x: exitX, y: target.y },
    target,
  ];
}

export function ElegantEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  source: sourceId,
  target: targetId,
  data,
  ...props
}: EdgeProps) {
  const route = (data as { route?: Pt[] } | undefined)?.route;
  const { getNodes } = useReactFlow();

  let path: string;
  let labelX: number;
  let labelY: number;

  if (route && route.length >= 2) {
    // ELK-computed waypoints — replace endpoints with actual handle positions
    const adjustedRoute = [
      { x: sourceX, y: sourceY },
      ...route.slice(1, -1),
      { x: targetX, y: targetY },
    ];
    path = roundedPolyline(adjustedRoute);
    const mid = Math.floor(adjustedRoute.length / 2);
    labelX = adjustedRoute[mid].x;
    labelY = adjustedRoute[mid].y - 10;
  } else {
    // Check for obstacles between source and target
    const nodes = getNodes();
    const nodeRects = nodes.map((n) => ({
      id: n.id,
      rect: {
        x: n.position.x,
        y: n.position.y,
        w: (n.measured?.width ?? n.width ?? 320),
        h: (n.measured?.height ?? n.height ?? 200),
      },
    }));

    const src: Pt = { x: sourceX, y: sourceY };
    const tgt: Pt = { x: targetX, y: targetY };
    const obstacles = findObstacles(src, tgt, sourceId, targetId, nodeRects);

    if (obstacles.length > 0) {
      // Route around obstacles with rounded polyline
      const waypoints = routeAroundObstacles(src, tgt, obstacles);
      path = roundedPolyline(waypoints);
      const mid = Math.floor(waypoints.length / 2);
      labelX = waypoints[mid].x;
      labelY = waypoints[mid].y - 10;
    } else {
      // No obstacles — adaptive cubic bezier (Blueprints-style)
      const dx = targetX - sourceX;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(targetY - sourceY);

      let cpOffset: number;
      if (dx > 0) {
        cpOffset = Math.max(80, absDx * 0.4, absDy * 0.25);
      } else {
        cpOffset = Math.max(120, absDx * 0.6 + 80, absDy * 0.3 + 60);
      }

      path = `M ${sourceX} ${sourceY} C ${sourceX + cpOffset} ${sourceY}, ${targetX - cpOffset} ${targetY}, ${targetX} ${targetY}`;
      labelX = (sourceX + targetX) / 2;
      labelY = (sourceY + targetY) / 2 - (dx > 0 ? 0 : 20);
    }
  }

  return (
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      {...props}
    />
  );
}
