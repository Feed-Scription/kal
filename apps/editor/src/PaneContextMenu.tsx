import { useEffect, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

export type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
};

type PaneContextMenuProps = {
  menu: ContextMenuState;
  onClose: () => void;
  onAddNode: (position: { x: number; y: number }) => void;
};

export function PaneContextMenu({ menu, onClose, onAddNode }: PaneContextMenuProps) {
  const { screenToFlowPosition } = useReactFlow();

  const handleAddBaseNode = useCallback(() => {
    const position = screenToFlowPosition({ x: menu.x, y: menu.y });
    onAddNode(position);
    onClose();
  }, [menu.x, menu.y, screenToFlowPosition, onAddNode, onClose]);

  useEffect(() => {
    if (!menu.open) return;
    const handleClick = () => onClose();
    const t = setTimeout(() => window.addEventListener("click", handleClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", handleClick);
    };
  }, [menu.open, onClose]);

  if (!menu.open) return null;

  return (
    <div
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
        onClick={handleAddBaseNode}
      >
        添加 Base Node 示例
      </button>
    </div>
  );
}
