import { memo } from "react";
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
import { useProjectStore } from "@/store/projectStore";
import { ListChecks, Plus, X } from "lucide-react";

type Option = { label: string; value: string };

export const ChoiceStepNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);
  const project = useProjectStore((state) => state.project);
  const flowNames = project ? Object.keys(project.flows) : [];
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
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b bg-teal-50 dark:bg-teal-950/30">
        <ListChecks className="size-4 text-teal-600" />
        <BaseNodeHeaderTitle>选择题</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">提示文本</label>
            <Input
              placeholder="请选择..."
              className="mt-1"
              value={config.promptText || ""}
              onChange={(e) => updateConfig({ promptText: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Flow 引用</label>
            {flowNames.length > 0 ? (
              <Select
                value={config.flowRef || ""}
                onValueChange={(val) => updateConfig({ flowRef: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="选择 Flow" />
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
                placeholder="Flow 名称"
                className="mt-1"
                value={config.flowRef || ""}
                onChange={(e) => updateConfig({ flowRef: e.target.value })}
              />
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">输入通道</label>
            <Input
              placeholder="choice"
              className="mt-1"
              value={config.inputChannel || ""}
              onChange={(e) => updateConfig({ inputChannel: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">State Key</label>
            <Input
              placeholder="可选，如 race"
              className="mt-1"
              value={config.stateKey || ""}
              onChange={(e) => updateConfig({ stateKey: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">选项列表</label>
            <div className="mt-1 space-y-1">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    placeholder="显示文本"
                    className="flex-1 text-xs"
                    value={opt.label}
                    onChange={(e) => updateOption(i, "label", e.target.value)}
                  />
                  <Input
                    placeholder="值"
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
                添加选项
              </Button>
            </div>
          </div>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="target"
        title="入口"
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
