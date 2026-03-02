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
import { FileText } from "lucide-react";

export const PromptBuildNode = memo(() => {
  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <FileText className="size-4" />
        <BaseNodeHeaderTitle>Prompt 构建</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div>
          <label className="text-xs text-muted-foreground">Data (JSON)</label>
          <Textarea
            placeholder='{"key": "value"}'
            className="mt-1 font-mono text-xs"
            rows={4}
          />
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="data"
        title="data"
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
        id="estimatedTokens"
        title="tokens"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

PromptBuildNode.displayName = "PromptBuildNode";
