import { memo } from "react";
import { Position } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { ArrowUpFromLine } from "lucide-react";

export const SignalOutNode = memo(() => {
  return (
    <BaseNode className="w-64">
      <BaseNodeHeader className="border-b">
        <ArrowUpFromLine className="size-4" />
        <BaseNodeHeaderTitle>信号输出</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <p className="text-xs text-muted-foreground">
          输出数据到外部
        </p>
      </BaseNodeContent>
      <LabeledHandle
        id="data"
        title="data"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="data"
        title="data"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

SignalOutNode.displayName = "SignalOutNode";
