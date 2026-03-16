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
import { useNodeConfig } from "@/hooks/use-node-config";
import { useFlowResource } from "@/kernel/hooks";
import { MessageSquare } from "lucide-react";

export const PromptStepNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);
  const { flowNames } = useFlowResource();

  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b bg-green-50 dark:bg-green-950/30">
        <MessageSquare className="size-4 text-green-600" />
        <BaseNodeHeaderTitle>等待输入</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
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
              placeholder="user_input"
              className="mt-1"
              value={config.inputChannel || ""}
              onChange={(e) => updateConfig({ inputChannel: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">State Key</label>
            <Input
              placeholder="可选，如 playerName"
              className="mt-1"
              value={config.stateKey || ""}
              onChange={(e) => updateConfig({ stateKey: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">提示文本</label>
            <Input
              placeholder="请输入..."
              className="mt-1"
              value={config.promptText || ""}
              onChange={(e) => updateConfig({ promptText: e.target.value })}
            />
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

PromptStepNode.displayName = "PromptStepNode";
