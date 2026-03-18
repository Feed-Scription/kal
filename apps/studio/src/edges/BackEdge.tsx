/**
 * BackEdge — custom edge that routes around nodes for cycle connections.
 *
 * Instead of drawing a straight line through nodes, back edges route
 * via a cubic bezier arc above both source and target nodes.
 */
import { BaseEdge, type EdgeProps } from '@xyflow/react';

const VERTICAL_OFFSET = 60;
const HORIZONTAL_PAD = 40;

export function BackEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  ...props
}: EdgeProps) {
  // Arc above both nodes
  const topY = Math.min(sourceY, targetY) - VERTICAL_OFFSET;
  const rightX = Math.max(sourceX, targetX) + HORIZONTAL_PAD;
  const leftX = Math.min(sourceX, targetX) - HORIZONTAL_PAD;
  const midX = (sourceX + targetX) / 2;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${rightX} ${sourceY}, ${rightX} ${topY}, ${midX} ${topY}`,
    `C ${leftX} ${topY}, ${leftX} ${targetY}, ${targetX} ${targetY}`,
  ].join(' ');

  return (
    <BaseEdge
      path={path}
      labelX={midX}
      labelY={topY - 10}
      {...props}
    />
  );
}
