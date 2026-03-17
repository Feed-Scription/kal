import { Button } from "@/components/ui/button";
import { Save, Play, Download, LayoutGrid } from "lucide-react";
import { useFlowResource, useStudioResources } from "@/kernel/hooks";
import { useTranslation } from "react-i18next";

type FlowToolbarProps = {
  onSave?: () => void;
  onExport?: () => void;
  onRun?: () => void;
  onAutoLayout?: () => void;
};

export function FlowToolbar({ onSave, onExport, onRun, onAutoLayout }: FlowToolbarProps) {
  const { project } = useStudioResources();
  const { flowId: currentFlow } = useFlowResource();
  const { t } = useTranslation('flow');

  if (!project || !currentFlow) return null;

  return (
    <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-top-2 duration-300 ease-[var(--ease-apple)]">
      <div className="flex items-center gap-2 border-r pr-2">
        <span className="text-sm font-medium">{currentFlow}</span>
        <span className="text-xs text-muted-foreground">
          {t('nodeCount', { count: project.flows[currentFlow]?.data.nodes.length || 0 })}
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onSave}
        title={t('saveFlow')}
      >
        <Save className="mr-1.5 size-4" />
        {t('save')}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onExport}
        title={t('exportJson')}
      >
        <Download className="mr-1.5 size-4" />
        {t('export')}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRun}
        title={t('runFlow')}
      >
        <Play className="mr-1.5 size-4" />
        {t('run')}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onAutoLayout}
        title={t('autoLayout')}
      >
        <LayoutGrid className="mr-1.5 size-4" />
        {t('layout')}
      </Button>
    </div>
  );
}
