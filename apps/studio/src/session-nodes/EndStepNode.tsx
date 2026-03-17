import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Input } from "@/components/ui/input";
import { useNodeConfig } from "@/hooks/use-node-config";
import { Square } from "lucide-react";

export const EndStepNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);

  return (
    <BaseNode className="w-64">
      <BaseNodeHeader className="border-b bg-red-50 dark:bg-red-950/30">
        <Square className="size-4 text-red-600" />
        <BaseNodeHeaderTitle>结束</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div>
          <label className="text-xs text-muted-foreground">结束消息</label>
          <Input
            placeholder="可选的结束消息"
            className="mt-1"
            value={config.message || ""}
            onChange={(e) => updateConfig({ message: e.target.value })}
          />
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="target"
        title="入口"
        type="target"
        position={Position.Left}
      />
    </BaseNode>
  );
});

EndStepNode.displayName = "EndStepNode";
