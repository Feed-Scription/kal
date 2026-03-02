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
import { Clock } from "lucide-react";

export const TimerNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);

  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <Clock className="size-4" />
        <BaseNodeHeaderTitle>计时器</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Delay (ms)</label>
            <Input
              type="number"
              placeholder="0"
              className="mt-1"
              value={config.delay ?? 0}
              onChange={(e) => updateConfig({ delay: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Interval (ms)</label>
            <Input
              type="number"
              placeholder="可选"
              className="mt-1"
              value={config.interval ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                updateConfig({ interval: val ? parseInt(val) : undefined });
              }}
            />
          </div>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="timestamp"
        title="timestamp"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

TimerNode.displayName = "TimerNode";
