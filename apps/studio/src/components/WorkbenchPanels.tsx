import { useState } from "react";
import { ChevronDown, ChevronUp, PanelBottomClose } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { usePanelContributions } from "@/kernel/hooks";
import { ExtensionSurface } from "./ExtensionSurface";

export function WorkbenchPanels() {
  const { t } = useTranslation('workbench');
  const panels = usePanelContributions();
  const [collapsed, setCollapsed] = useState(false);

  if (panels.length === 0) {
    return null;
  }

  return (
    <div className="border-t bg-background/70">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40"
      >
        <span className="flex items-center gap-1.5">
          <PanelBottomClose className="size-3.5" />
          {t("panels", { count: panels.length })}
        </span>
        {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
      {!collapsed && (
        <div className="grid max-h-72 gap-3 overflow-auto p-3 lg:grid-cols-2">
          {panels.map(({ contribution, runtime }) => (
            <ExtensionSurface
              key={contribution.id}
              contribution={contribution}
              runtime={runtime}
            />
          ))}
        </div>
      )}
    </div>
  );
}
