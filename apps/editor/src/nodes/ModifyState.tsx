import { memo } from "react";
import { Position } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Edit } from "lucide-react";

export const ModifyStateNode = memo(() => {
  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <Edit className="size-4" />
        <BaseNodeHeaderTitle>修改状态</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="text-xs text-muted-foreground">
          通过输入端口接收 key 和新的 value
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

ModifyStateNode.displayName = "ModifyStateNode";
