/**
 * ElegantEdge — smooth cubic bezier with adaptive horizontal tangents.
 *
 * Mimics the Unreal Blueprints / Blender Nodes wire style:
 * - Leaves source port horizontally to the right
 * - Enters target port horizontally from the left
 * - Control point offset adapts to distance for consistent curvature
 */
import { BaseEdge, type EdgeProps } from '@xyflow/react';

export function ElegantEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  ...props
}: EdgeProps) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Adaptive control point offset:
  // - Minimum 80px so short connections still curve nicely
  // - Scales with horizontal distance for long connections
  // - When target is left of source (backward), increase offset to create a wider arc
  let cpOffset: number;
  if (dx > 0) {
    // Forward connection: gentle curve
    cpOffset = Math.max(80, absDx * 0.4, absDy * 0.25);
  } else {
    // Backward connection: wider arc to avoid overlapping nodes
    cpOffset = Math.max(120, absDx * 0.6 + 80, absDy * 0.3 + 60);
  }

  const path = `M ${sourceX} ${sourceY} C ${sourceX + cpOffset} ${sourceY}, ${targetX - cpOffset} ${targetY}, ${targetX} ${targetY}`;

  // Label at the midpoint of the curve
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2 - (dx > 0 ? 0 : 20);

  return (
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      {...props}
    />
  );
}
