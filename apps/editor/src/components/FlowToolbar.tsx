import { Button } from "@/components/ui/button";
import { Save, Play, Download, LayoutGrid } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";

type FlowToolbarProps = {
  onSave?: () => void;
  onExport?: () => void;
  onRun?: () => void;
  onAutoLayout?: () => void;
};

export function FlowToolbar({ onSave, onExport, onRun, onAutoLayout }: FlowToolbarProps) {
  const project = useProjectStore((state) => state.project);
  const currentFlow = useProjectStore((state) => state.currentFlow);

  if (!project || !currentFlow) return null;

  return (
    <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2 border-r pr-2">
        <span className="text-sm font-medium">{currentFlow}</span>
        <span className="text-xs text-muted-foreground">
          ({project.flows[currentFlow]?.data.nodes.length || 0} 节点)
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onSave}
        title="保存 Flow (Ctrl+S)"
      >
        <Save className="mr-1.5 size-4" />
        保存
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onExport}
        title="导出 JSON"
      >
        <Download className="mr-1.5 size-4" />
        导出
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRun}
        title="运行 Flow"
      >
        <Play className="mr-1.5 size-4" />
        运行
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onAutoLayout}
        title="自动排版"
      >
        <LayoutGrid className="mr-1.5 size-4" />
        排版
      </Button>
    </div>
  );
}
