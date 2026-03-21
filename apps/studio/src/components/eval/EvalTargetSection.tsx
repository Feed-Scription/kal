import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import type { NodeDefinition } from '@/types/project';
import { parsePromptFragments, isSupportedPromptFragmentType } from '@/utils/prompt-fragments';

export function EvalTargetSection({
  flowId,
  nodeId,
  runs,
  flowNames,
  evalNodes,
  onFlowChange,
  onNodeChange,
  onRunsChange,
}: {
  flowId: string;
  nodeId: string;
  runs: number;
  flowNames: string[];
  evalNodes: NodeDefinition[];
  onFlowChange: (id: string) => void;
  onNodeChange: (id: string) => void;
  onRunsChange: (n: number) => void;
}) {
  const { t } = useTranslation('eval');

  const selectedNode = evalNodes.find((n) => n.id === nodeId);
  const fragments = parsePromptFragments(selectedNode?.config?.fragments);
  const typeCounts: Record<string, number> = {};
  for (const f of fragments) {
    const type = isSupportedPromptFragmentType(f.type) ? f.type : 'base';
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>{t('flow')}</Label>
          <Select value={flowId} onValueChange={onFlowChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('chooseFlow')} />
            </SelectTrigger>
            <SelectContent>
              {flowNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('node')}</Label>
          <Select value={nodeId} onValueChange={onNodeChange} disabled={evalNodes.length === 0}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('chooseNode')} />
            </SelectTrigger>
            <SelectContent>
              {evalNodes.map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {node.label || node.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('runs')}</Label>
          <div className="flex items-center gap-3">
            <Slider
              value={[runs]}
              onValueChange={([v]) => onRunsChange(v!)}
              min={1}
              max={20}
              step={1}
              className="flex-1"
            />
            <Input
              type="number"
              className="w-16"
              min={1}
              max={20}
              value={runs}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v >= 1 && v <= 20) onRunsChange(v);
              }}
            />
          </div>
        </div>
      </div>

      {selectedNode && fragments.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{selectedNode.label || selectedNode.id}</span>
          <span>—</span>
          {Object.entries(typeCounts).map(([type, count]) => (
            <Badge key={type} variant="outline" className="text-[10px]">
              {type} ×{count}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}
