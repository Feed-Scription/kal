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
import { Braces } from "lucide-react";

export const JSONParseNode = memo(() => {
  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <Braces className="size-4" />
        <BaseNodeHeaderTitle>JSON 解析</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div>
          <label className="text-xs text-muted-foreground">Text</label>
          <Textarea
            placeholder='{"key": "value"}'
            className="mt-1 font-mono text-xs"
            rows={4}
          />
        </div>
        <div className="mt-2 space-y-1">
          <label className="flex items-center text-xs">
            <input type="checkbox" className="mr-2" defaultChecked />
            Extract from code block
          </label>
          <label className="flex items-center text-xs">
            <input type="checkbox" className="mr-2" defaultChecked />
            Fix common errors
          </label>
          <label className="flex items-center text-xs">
            <input type="checkbox" className="mr-2" defaultChecked />
            Fix truncated JSON
          </label>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="text"
        title="text"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="data"
        title="data"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
      <LabeledHandle
        id="success"
        title="success"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
      <LabeledHandle
        id="error"
        title="error"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

JSONParseNode.displayName = "JSONParseNode";
