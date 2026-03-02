import { memo } from "react";
import { Position } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { ArrowDownToLine } from "lucide-react";

export const SignalInNode = memo(() => {
  return (
    <BaseNode className="w-64">
      <BaseNodeHeader className="border-b">
        <ArrowDownToLine className="size-4" />
        <BaseNodeHeaderTitle>信号输入</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <p className="text-xs text-muted-foreground">
          接收外部输入数据
        </p>
      </BaseNodeContent>
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

SignalInNode.displayName = "SignalInNode";
