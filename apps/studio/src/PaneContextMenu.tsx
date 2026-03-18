import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Search } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset search when menu opens
  useEffect(() => {
    if (menu.open) {
      setSearch("");
      // Focus the search input after the menu renders
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [menu.open]);

  const grouped = useMemo(() => {
    const categoryLabels: Record<string, string> = {
      signal: t('categoryLabels.signal'),
      state: t('categoryLabels.state'),
      llm: t('categoryLabels.llm'),
      transform: t('categoryLabels.transform'),
      utility: t('categoryLabels.utility'),
    };

    const query = search.toLowerCase().trim();

    const filtered = query
      ? manifests.filter(
          (m) =>
            m.type.toLowerCase().includes(query) ||
            (m.label && m.label.toLowerCase().includes(query)) ||
            (m.category && m.category.toLowerCase().includes(query)),
        )
      : manifests;

    const groups = new Map<string, NodeManifest[]>();
    for (const manifest of filtered) {
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
  }, [manifests, i18n.language, t, search]);

  const handleAddNode = useCallback((nodeType: string) => {
    const position = screenToFlowPosition({ x: menu.x, y: menu.y });
    onAddNode(position, nodeType);
    onClose();
  }, [menu.x, menu.y, screenToFlowPosition, onAddNode, onClose]);

  useEffect(() => {
    if (!menu.open) return;
    const handleClick = () => onClose();
    const timer = setTimeout(() => window.addEventListener("click", handleClick), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClick);
    };
  }, [menu.open, onClose]);

  // Keyboard: Escape to close
  useEffect(() => {
    if (!menu.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menu.open, onClose]);

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useEffect(() => {
    if (!menu.open) return;
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

  const totalResults = grouped.reduce((sum, g) => sum + g.nodes.length, 0);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[260px] max-h-[500px] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 ease-[var(--ease-apple-bounce)]"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search input */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchNodes') ?? 'Search nodes...'}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Node list */}
      <div className="max-h-[420px] overflow-y-auto p-1">
        {totalResults === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('noResults') ?? 'No matching nodes.'}
          </div>
        ) : (
          grouped.map((category) => (
            <div key={category.label} className="mb-1">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {category.label}
              </div>
              {category.nodes.map((node) => (
                <button
                  key={node.type}
                  type="button"
                  className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => handleAddNode(node.type)}
                >
                  <span className="flex-1 truncate">{node.label || node.type}</span>
                  {search && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{node.type}</span>
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
