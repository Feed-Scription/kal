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
import { Search } from "lucide-react";

export const RegexNode = memo(() => {
  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <Search className="size-4" />
        <BaseNodeHeaderTitle>正则匹配</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Text</label>
            <Textarea
              placeholder="待匹配文本..."
              className="mt-1"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Pattern</label>
            <Input placeholder="正则表达式" className="mt-1 font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Flags</label>
            <Input placeholder="g, i, m..." className="mt-1" />
          </div>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="text"
        title="text"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="matches"
        title="matches"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
      <LabeledHandle
        id="groups"
        title="groups"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

RegexNode.displayName = "RegexNode";
