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
import { Textarea } from "@/components/ui/textarea";
import { Image } from "lucide-react";

export const GenerateImageNode = memo(() => {
  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <Image className="size-4" />
        <BaseNodeHeaderTitle>生成图像</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Prompt</label>
            <Textarea
              placeholder="图像描述..."
              className="mt-1"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Model</label>
            <Input placeholder="dall-e-3" className="mt-1" />
          </div>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="prompt"
        title="prompt"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="imageUrl"
        title="imageUrl"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

GenerateImageNode.displayName = "GenerateImageNode";
