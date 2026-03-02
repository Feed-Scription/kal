import { memo } from "react";
import { Position } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Textarea } from "@/components/ui/textarea";
import { Wand2 } from "lucide-react";

export const PostProcessNode = memo(() => {
  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <Wand2 className="size-4" />
        <BaseNodeHeaderTitle>后处理</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div>
          <label className="text-xs text-muted-foreground">Text</label>
          <Textarea
            placeholder="待处理文本..."
            className="mt-1"
            rows={3}
          />
        </div>
        <div className="mt-2">
          <label className="text-xs text-muted-foreground">Processors</label>
          <p className="text-xs text-muted-foreground mt-1">
            trim, replace, slice, toLowerCase, toUpperCase
          </p>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="text"
        title="text"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="text"
        title="text"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

PostProcessNode.displayName = "PostProcessNode";
