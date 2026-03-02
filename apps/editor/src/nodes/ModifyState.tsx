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
import { Edit } from "lucide-react";

export const ModifyStateNode = memo(() => {
  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <Edit className="size-4" />
        <BaseNodeHeaderTitle>修改状态</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Key</label>
            <Input placeholder="状态键名" className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Value</label>
            <Input placeholder="新值" className="mt-1" />
          </div>
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
