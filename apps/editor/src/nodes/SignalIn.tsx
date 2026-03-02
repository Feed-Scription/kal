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
      <BaseNodeHeader className="border-b bg-green-500/10">
        <ArrowDownToLine className="size-4 text-green-600" />
        <BaseNodeHeaderTitle>信号输入</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <p className="text-xs text-muted-foreground">
          接收外部输入数据，作为 Flow 的入口点
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
