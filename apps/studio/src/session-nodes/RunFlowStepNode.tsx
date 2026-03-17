import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Position, type NodeProps } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useNodeConfig } from "@/hooks/use-node-config";
import { useFlowResource } from "@/kernel/hooks";
import { Play } from "lucide-react";
import { overlayClassName } from "@/hooks/use-node-overlay";
import { NodeOverlayBadge } from "@/components/NodeOverlayBadge";
import type { NodeOverlayState } from "@/hooks/use-node-overlay";

export const RunFlowStepNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const overlay = (data as any).overlay as NodeOverlayState | undefined;
  const { updateConfig } = useNodeConfig(id);
  const { flowNames } = useFlowResource();
  const { t } = useTranslation('session');

  return (
    <BaseNode className={`w-72 ${overlayClassName(overlay)}`}>
      <NodeOverlayBadge overlay={overlay} />
      <BaseNodeHeader className="border-b bg-blue-50 dark:bg-blue-950/30">
        <Play className="size-4 text-blue-600" />
        <BaseNodeHeaderTitle>{t('stepTypes.RunFlow')}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">{t('node.flowRef')}</label>
            {flowNames.length > 0 ? (
              <Select
                value={config.flowRef || ""}
                onValueChange={(val) => updateConfig({ flowRef: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('node.selectFlow')} />
                </SelectTrigger>
                <SelectContent>
                  {flowNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder={t('node.flowName')}
                className="mt-1"
                value={config.flowRef || ""}
                onChange={(e) => updateConfig({ flowRef: e.target.value })}
              />
            )}
          </div>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="target"
        title={t('node.entry')}
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="next"
        title="next"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

RunFlowStepNode.displayName = "RunFlowStepNode";
