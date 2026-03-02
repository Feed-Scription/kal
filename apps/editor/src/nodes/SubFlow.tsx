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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNodeConfig } from "@/hooks/use-node-config";
import { useProjectStore } from "@/store/projectStore";
import { GitBranch } from "lucide-react";

export const SubFlowNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);
  const project = useProjectStore((state) => state.project);
  const flowNames = project ? Object.keys(project.flows) : [];

  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <GitBranch className="size-4" />
        <BaseNodeHeaderTitle>子流程</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Flow Reference</label>
            {flowNames.length > 0 ? (
              <Select
                value={config.ref || ""}
                onValueChange={(val) => updateConfig({ ref: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="选择子流程" />
                </SelectTrigger>
                <SelectContent>
                  {flowNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="子流程文件路径"
                className="mt-1"
                value={config.ref || ""}
                onChange={(e) => updateConfig({ ref: e.target.value })}
              />
            )}
          </div>
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
