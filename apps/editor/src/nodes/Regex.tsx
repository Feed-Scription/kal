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
import { Search } from "lucide-react";

export const RegexNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);

  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <Search className="size-4" />
        <BaseNodeHeaderTitle>正则匹配</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Pattern</label>
            <Input
              placeholder="正则表达式"
              className="mt-1 font-mono"
              value={config.pattern || ""}
              onChange={(e) => updateConfig({ pattern: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Flags</label>
            <Input
              placeholder="g, i, m..."
              className="mt-1"
              value={config.flags || ""}
              onChange={(e) => updateConfig({ flags: e.target.value })}
            />
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
