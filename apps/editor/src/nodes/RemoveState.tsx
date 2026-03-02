import { memo } from "react";
import { Position } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Trash2 } from "lucide-react";

export const RemoveStateNode = memo(() => {
  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <Trash2 className="size-4" />
        <BaseNodeHeaderTitle>删除状态</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="text-xs text-muted-foreground">
          通过输入端口接收要删除的 key
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="key"
        title="key"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="success"
        title="success"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

RemoveStateNode.displayName = "RemoveStateNode";
