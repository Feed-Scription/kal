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
import { Button } from "@/components/ui/button";
import { useNodeConfig } from "@/hooks/use-node-config";
import { useFlowResource } from "@/kernel/hooks";
import { ListChecks, Plus, X } from "lucide-react";
import { overlayClassName } from "@/hooks/use-node-overlay";
import { NodeOverlayBadge } from "@/components/NodeOverlayBadge";
import type { NodeOverlayState } from "@/hooks/use-node-overlay";

type Option = { label: string; value: string };

export const ChoiceStepNode = memo(({ id, data }: NodeProps) => {
  const { t } = useTranslation('session');
  const config = (data as any).config || {};
  const overlay = (data as any).overlay as NodeOverlayState | undefined;
  const { updateConfig } = useNodeConfig(id);
  const { flowNames } = useFlowResource();
  const options: Option[] = config.options || [];

  const addOption = () => {
    updateConfig({ options: [...options, { label: "", value: "" }] });
  };

  const removeOption = (index: number) => {
    updateConfig({ options: options.filter((_, i) => i !== index) });
  };

  const updateOption = (index: number, field: keyof Option, value: string) => {
    updateConfig({
      options: options.map((o, i) => (i === index ? { ...o, [field]: value } : o)),
    });
  };

  return (
    <BaseNode className={`w-96 ${overlayClassName(overlay)}`}>
      <NodeOverlayBadge overlay={overlay} />
      <BaseNodeHeader className="border-b bg-teal-50 dark:bg-teal-950/30">
        <ListChecks className="size-4 text-teal-600" />
        <BaseNodeHeaderTitle>{t('stepTypes.Choice')}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">{t('node.promptText')}</label>
            <Input
              placeholder={t('node.choicePromptPlaceholder')}
              className="mt-1"
              value={config.promptText || ""}
              onChange={(e) => updateConfig({ promptText: e.target.value })}
            />
          </div>
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
              placeholder="choice"
              className="mt-1"
              value={config.inputChannel || ""}
              onChange={(e) => updateConfig({ inputChannel: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('node.stateKey')}</label>
            <Input
              placeholder={t('node.choiceStateKeyPlaceholder')}
              className="mt-1"
              value={config.stateKey || ""}
              onChange={(e) => updateConfig({ stateKey: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('node.optionsList')}</label>
            <div className="mt-1 space-y-1">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    placeholder={t('node.displayText')}
                    className="flex-1 text-xs"
                    value={opt.label}
                    onChange={(e) => updateOption(i, "label", e.target.value)}
                  />
                  <Input
                    placeholder={t('node.value')}
                    className="w-24 text-xs"
                    value={opt.value}
                    onChange={(e) => updateOption(i, "value", e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => removeOption(i)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={addOption}
              >
                <Plus className="mr-1 size-3" />
                {t('node.addOption')}
              </Button>
            </div>
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

ChoiceStepNode.displayName = "ChoiceStepNode";
