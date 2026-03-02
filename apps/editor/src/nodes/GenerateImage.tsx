import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Input } from "@/components/ui/input";
import { useNodeConfig } from "@/hooks/use-node-config";
import { Image } from "lucide-react";

export const GenerateImageNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);

  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <Image className="size-4" />
        <BaseNodeHeaderTitle>生成图像</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div>
          <label className="text-xs text-muted-foreground">Model</label>
          <Input
            placeholder="dall-e-3"
            className="mt-1"
            value={config.model || ""}
            onChange={(e) => updateConfig({ model: e.target.value })}
          />
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
