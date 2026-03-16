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
import { Play } from "lucide-react";

export const RunFlowStepNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);
  const { flowNames } = useFlowResource();

  return (
    <BaseNode className="w-72">
      <BaseNodeHeader className="border-b bg-blue-50 dark:bg-blue-950/30">
        <Play className="size-4 text-blue-600" />
        <BaseNodeHeaderTitle>执行 Flow</BaseNodeHeaderTitle>
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

RunFlowStepNode.displayName = "RunFlowStepNode";
