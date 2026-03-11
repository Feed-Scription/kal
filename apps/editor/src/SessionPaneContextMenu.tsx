import { useEffect, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

export type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
};

type SessionPaneContextMenuProps = {
  menu: ContextMenuState;
  onClose: () => void;
  onAddNode: (position: { x: number; y: number }, nodeType: string) => void;
};

const stepTypes = [
  { type: "RunFlow", label: "执行 Flow" },
  { type: "Prompt", label: "等待输入" },
  { type: "Choice", label: "选择题" },
  { type: "Branch", label: "条件分支" },
  { type: "End", label: "结束" },
];

export function SessionPaneContextMenu({ menu, onClose, onAddNode }: SessionPaneContextMenuProps) {
  const { screenToFlowPosition } = useReactFlow();

  const handleAddNode = useCallback((nodeType: string) => {
    const position = screenToFlowPosition({ x: menu.x, y: menu.y });
    onAddNode(position, nodeType);
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
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
        添加步骤
      </div>
      {stepTypes.map((step) => (
        <button
          key={step.type}
          type="button"
          className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAddNode(step.type)}
        >
          {step.label}
        </button>
      ))}
    </div>
  );
}
