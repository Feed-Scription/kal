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
import { Sparkles } from "lucide-react";

export const GenerateTextNode = memo(() => {
  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <Sparkles className="size-4" />
        <BaseNodeHeaderTitle>生成文本</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Model</label>
            <Input placeholder="gpt-4" className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Temperature</label>
            <Input type="number" placeholder="0.7" className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Max Tokens</label>
            <Input type="number" placeholder="2000" className="mt-1" />
          </div>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="messages"
        title="messages"
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
      <LabeledHandle
        id="usage"
        title="usage"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

GenerateTextNode.displayName = "GenerateTextNode";
