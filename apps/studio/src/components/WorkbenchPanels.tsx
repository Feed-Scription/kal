import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, PanelBottomClose } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { useDiagnostics, usePanelContributions } from "@/kernel/hooks";
import { ExtensionSurface } from "./ExtensionSurface";

export function WorkbenchPanels() {
  const { t } = useTranslation('workbench');
  const panels = usePanelContributions();
  const { diagnostics } = useDiagnostics();
  const [collapsed, setCollapsed] = useState(true);

  const errorCount = diagnostics?.summary?.errors ?? 0;
  const warningCount = diagnostics?.summary?.warnings ?? 0;
  const issueCount = errorCount + warningCount;

  // Auto-expand when new errors appear
  useEffect(() => {
    if (errorCount > 0) {
      setCollapsed(false);
    }
  }, [errorCount]);

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
          {issueCount > 0 && (
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              errorCount > 0
                ? 'bg-destructive/10 text-destructive'
                : 'bg-yellow-500/10 text-yellow-600'
            }`}>
              <AlertTriangle className="size-3" />
              {errorCount > 0 && t('problems.panelSummary', { errors: errorCount, warnings: warningCount })}
              {errorCount === 0 && warningCount > 0 && `${warningCount}`}
            </span>
          )}
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
