import { useEffect, useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import type { NodeManifest } from "@/types/project";

export type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
};

type PaneContextMenuProps = {
  menu: ContextMenuState;
  manifests: NodeManifest[];
  onClose: () => void;
  onAddNode: (position: { x: number; y: number }, nodeType: string) => void;
};

const categoryLabels: Record<string, string> = {
  signal: "信号节点",
  state: "状态节点",
  llm: "LLM 节点",
  transform: "转换节点",
};

export function PaneContextMenu({ menu, manifests, onClose, onAddNode }: PaneContextMenuProps) {
  const { screenToFlowPosition } = useReactFlow();

  const grouped = useMemo(() => {
    const groups = new Map<string, NodeManifest[]>();
    for (const manifest of manifests) {
      const category = manifest.category || "other";
      const list = groups.get(category) ?? [];
      list.push(manifest);
      groups.set(category, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, nodes]) => ({
        label: categoryLabels[category] || category,
        nodes: [...nodes].sort((a, b) => a.type.localeCompare(b.type)),
      }));
  }, [manifests]);

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
      className="fixed z-50 min-w-[220px] max-h-[500px] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {grouped.map((category) => (
        <div key={category.label} className="mb-2">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {category.label}
          </div>
          {category.nodes.map((node) => (
            <button
              key={node.type}
              type="button"
              className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleAddNode(node.type)}
            >
              {node.label || node.type}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
