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
import { Button } from "@/components/ui/button";
import { useNodeConfig } from "@/hooks/use-node-config";
import { GitBranch, Plus, X } from "lucide-react";
import { overlayClassName } from "@/hooks/use-node-overlay";
import { NodeOverlayBadge } from "@/components/NodeOverlayBadge";
import type { NodeOverlayState } from "@/hooks/use-node-overlay";

type Condition = { when: string; next: string };

export const BranchStepNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const overlay = (data as any).overlay as NodeOverlayState | undefined;
  const { updateConfig } = useNodeConfig(id);
  const conditions: Condition[] = config.conditions || [];

  const addCondition = () => {
    updateConfig({ conditions: [...conditions, { when: "", next: "" }] });
  };

  const removeCondition = (index: number) => {
    updateConfig({ conditions: conditions.filter((_, i) => i !== index) });
  };

  const updateCondition = (index: number, field: keyof Condition, value: string) => {
    updateConfig({
      conditions: conditions.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      ),
    });
  };

  return (
    <BaseNode className={`w-80 ${overlayClassName(overlay)}`}>
      <NodeOverlayBadge overlay={overlay} />
      <BaseNodeHeader className="border-b bg-amber-50 dark:bg-amber-950/30">
        <GitBranch className="size-4 text-amber-600" />
        <BaseNodeHeaderTitle>条件分支</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          {conditions.map((cond, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                placeholder="条件表达式"
                className="flex-1 text-xs"
                value={cond.when}
                onChange={(e) => updateCondition(i, "when", e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => removeCondition(i)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addCondition}
          >
            <Plus className="mr-1 size-3" />
            添加条件
          </Button>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="target"
        title="入口"
        type="target"
        position={Position.Left}
      />
      {conditions.map((_, i) => (
        <LabeledHandle
          key={`condition-${i}`}
          id={`condition-${i}`}
          title={`条件 ${i + 1}`}
          type="source"
          position={Position.Right}
          labelClassName="flex-1 text-right"
          style={{ top: `${30 + i * 20}%` }}
        />
      ))}
      <LabeledHandle
        id="default"
        title="默认"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
        style={{ top: "90%" }}
      />
    </BaseNode>
  );
});

BranchStepNode.displayName = "BranchStepNode";
