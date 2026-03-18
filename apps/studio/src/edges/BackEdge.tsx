/**
 * BackEdge — custom edge that routes around nodes for cycle connections.
 *
 * Instead of drawing a straight line through nodes, back edges route:
 *   source (right) → offset right → arc up above all nodes → offset left → target (left)
 *
 * This mimics the Unreal Blueprints pattern for feedback loops.
 */
import { type EdgeProps } from '@xyflow/react';

const VERTICAL_OFFSET = 60;
const HORIZONTAL_PAD = 40;

export function BackEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  label,
  labelStyle,
}: EdgeProps) {
  // Determine the top-most Y so the loop goes above both nodes
  const topY = Math.min(sourceY, targetY) - VERTICAL_OFFSET;

  // Control points: go right from source, up, across, down, into target
  const rightX = Math.max(sourceX, targetX) + HORIZONTAL_PAD;
  const leftX = Math.min(sourceX, targetX) - HORIZONTAL_PAD;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${rightX} ${sourceY}, ${rightX} ${topY}, ${(sourceX + targetX) / 2} ${topY}`,
    `C ${leftX} ${topY}, ${leftX} ${targetY}, ${targetX} ${targetY}`,
  ].join(' ');

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        style={style}
        markerEnd={markerEnd as string}
      />
      {/* Wider invisible path for easier selection */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />
      {label && (
        <text>
          <textPath
            href={`#${id}`}
            startOffset="50%"
            textAnchor="middle"
            style={labelStyle as React.CSSProperties}
            dy={-6}
          >
            {label}
          </textPath>
        </text>
      )}
    </>
  );
}
