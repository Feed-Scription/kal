import { memo } from "react";
import { Position } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Eye } from "lucide-react";

export const ReadStateNode = memo(() => {
  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <Eye className="size-4" />
        <BaseNodeHeaderTitle>读取状态</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="text-xs text-muted-foreground">
          通过输入端口接收要读取的 key
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="key"
        title="key"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="value"
        title="value"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
      <LabeledHandle
        id="exists"
        title="exists"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

ReadStateNode.displayName = "ReadStateNode";
