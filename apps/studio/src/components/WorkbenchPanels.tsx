import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { useDiagnostics, usePanelContributions } from "@/kernel/hooks";
import { ExtensionSurface } from "./ExtensionSurface";

export function WorkbenchPanels() {
  const { t } = useTranslation('workbench');
  const { t: tr } = useTranslation('registry');
  const panels = usePanelContributions();
  const { diagnostics } = useDiagnostics();
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const errorCount = diagnostics?.summary?.errors ?? 0;
  const warningCount = diagnostics?.summary?.warnings ?? 0;
  const issueCount = errorCount + warningCount;

  // Keep activeTabId in sync with available panels
  useEffect(() => {
    if (panels.length === 0) {
      setActiveTabId(null);
      return;
    }
    const ids = panels.map((p) => p.contribution.id);
    if (activeTabId === null || !ids.includes(activeTabId)) {
      setActiveTabId(ids[0]!);
    }
  }, [panels, activeTabId]);

  if (panels.length === 0) {
    return null;
  }

  const activePanel = panels.find((p) => p.contribution.id === activeTabId);

  return (
    <div className="flex h-full flex-col bg-background/70">
      <div className="flex items-center px-1 py-0.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {panels.map(({ contribution }) => (
            <button
              key={contribution.id}
              type="button"
              onClick={() => setActiveTabId(contribution.id)}
              className={`shrink-0 rounded-sm px-2 py-1 transition-colors hover:bg-muted/40 ${
                contribution.id === activeTabId
                  ? 'bg-muted text-foreground font-medium'
                  : ''
              }`}
            >
              {tr(contribution.title)}
            </button>
          ))}
          {issueCount > 0 && (
            <span className={`ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              errorCount > 0
                ? 'bg-destructive/10 text-destructive'
                : 'bg-yellow-500/10 text-yellow-600'
            }`}>
              <AlertTriangle className="size-3" />
              {errorCount > 0 && t('problems.panelSummary', { errors: errorCount, warnings: warningCount })}
              {errorCount === 0 && warningCount > 0 && `${warningCount}`}
            </span>
          )}
        </div>
      </div>
      {activePanel && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <ExtensionSurface
            key={activePanel.contribution.id}
            contribution={activePanel.contribution}
            runtime={activePanel.runtime}
          />
        </div>
      )}
    </div>
  );
}
