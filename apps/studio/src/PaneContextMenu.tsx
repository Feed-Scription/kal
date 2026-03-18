import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useTranslation } from "react-i18next";
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

export function PaneContextMenu({ menu, manifests, onClose, onAddNode }: PaneContextMenuProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { t, i18n } = useTranslation('flow');

  const grouped = useMemo(() => {
    const categoryLabels: Record<string, string> = {
      signal: t('categoryLabels.signal'),
      state: t('categoryLabels.state'),
      llm: t('categoryLabels.llm'),
      transform: t('categoryLabels.transform'),
    };
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
  }, [manifests, i18n.language, t]);

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

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useEffect(() => {
    if (!menu.open) return;
    // Reset to raw click position first, then clamp after measuring
    setPos({ x: menu.x, y: menu.y });
    requestAnimationFrame(() => {
      const el = menuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let x = menu.x;
      let y = menu.y;
      if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
      if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
      if (x < 0) x = 8;
      if (y < 0) y = 8;
      setPos({ x, y });
    });
  }, [menu.open, menu.x, menu.y]);

  if (!menu.open) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] max-h-[500px] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 ease-[var(--ease-apple-bounce)]"
      style={{ left: pos.x, top: pos.y }}
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
