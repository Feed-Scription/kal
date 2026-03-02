import { memo } from "react";
import { Position } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Input } from "@/components/ui/input";
import { Clock } from "lucide-react";

export const TimerNode = memo(() => {
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
            <Input type="number" placeholder="0" className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Interval (ms)</label>
            <Input type="number" placeholder="可选" className="mt-1" />
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
