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
import { MessageSquare } from "lucide-react";
import { overlayClassName } from "@/hooks/use-node-overlay";
import { NodeOverlayBadge } from "@/components/NodeOverlayBadge";
import type { NodeOverlayState } from "@/hooks/use-node-overlay";

export const PromptStepNode = memo(({ id, data }: NodeProps) => {
  const { t } = useTranslation('session');
  const config = (data as any).config || {};
  const overlay = (data as any).overlay as NodeOverlayState | undefined;
  const { updateConfig } = useNodeConfig(id);
  const { flowNames } = useFlowResource();

  return (
    <BaseNode className={`w-80 ${overlayClassName(overlay)}`}>
      <NodeOverlayBadge overlay={overlay} />
      <BaseNodeHeader className="border-b bg-green-50 dark:bg-green-950/30">
        <MessageSquare className="size-4 text-green-600" />
        <BaseNodeHeaderTitle>{t('stepTypes.Prompt')}</BaseNodeHeaderTitle>
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
          <div>
            <label className="text-xs text-muted-foreground">{t('node.inputChannel')}</label>
            <Input
              placeholder="user_input"
              className="mt-1"
              value={config.inputChannel || ""}
              onChange={(e) => updateConfig({ inputChannel: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('node.stateKey')}</label>
            <Input
              placeholder={t('node.stateKeyPlaceholder')}
              className="mt-1"
              value={config.stateKey || ""}
              onChange={(e) => updateConfig({ stateKey: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('node.promptText')}</label>
            <Input
              placeholder={t('node.promptTextPlaceholder')}
              className="mt-1"
              value={config.promptText || ""}
              onChange={(e) => updateConfig({ promptText: e.target.value })}
            />
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

PromptStepNode.displayName = "PromptStepNode";
