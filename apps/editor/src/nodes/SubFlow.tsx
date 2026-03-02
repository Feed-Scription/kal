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
import { GitBranch } from "lucide-react";

export const SubFlowNode = memo(() => {
  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <GitBranch className="size-4" />
        <BaseNodeHeaderTitle>子流程</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div>
          <label className="text-xs text-muted-foreground">Flow Reference</label>
          <Input placeholder="子流程文件路径" className="mt-1" />
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="input"
        title="input"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="output"
        title="output"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

SubFlowNode.displayName = "SubFlowNode";
