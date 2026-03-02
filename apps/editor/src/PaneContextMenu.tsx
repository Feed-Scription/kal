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
  onAddNode: (position: { x: number; y: number }, nodeType: string) => void;
};

const nodeCategories = [
  {
    label: "信号节点",
    nodes: [
      { type: "SignalIn", label: "信号输入" },
      { type: "SignalOut", label: "信号输出" },
      { type: "Timer", label: "计时器" },
    ],
  },
  {
    label: "状态节点",
    nodes: [
      { type: "AddState", label: "添加状态" },
      { type: "RemoveState", label: "删除状态" },
      { type: "ReadState", label: "读取状态" },
      { type: "ModifyState", label: "修改状态" },
    ],
  },
  {
    label: "LLM 节点",
    nodes: [
      { type: "PromptBuild", label: "Prompt 构建" },
      { type: "Message", label: "消息组装" },
      { type: "GenerateText", label: "生成文本" },
      { type: "GenerateImage", label: "生成图像" },
    ],
  },
  {
    label: "转换节点",
    nodes: [
      { type: "Regex", label: "正则匹配" },
      { type: "JSONParse", label: "JSON 解析" },
      { type: "PostProcess", label: "后处理" },
      { type: "SubFlow", label: "子流程" },
    ],
  },
];

export function PaneContextMenu({ menu, onClose, onAddNode }: PaneContextMenuProps) {
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
      className="fixed z-50 min-w-[200px] max-h-[500px] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {nodeCategories.map((category) => (
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
              {node.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
