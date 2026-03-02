import { memo, useState } from "react";
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
import { Wand2, Plus, X } from "lucide-react";

const PROCESSOR_TYPES = ["trim", "replace", "slice", "toLowerCase", "toUpperCase"] as const;

type ProcessorDef = {
  type: string;
  pattern?: string;
  flags?: string;
  replacement?: string;
  start?: number;
  end?: number;
};

function ProcessorItem({
  proc,
  onChange,
  onRemove,
}: {
  proc: ProcessorDef;
  onChange: (p: ProcessorDef) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{proc.type}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      </div>
      {proc.type === "replace" && (
        <div className="space-y-1">
          <Input
            placeholder="pattern"
            className="font-mono text-xs"
            value={proc.pattern || ""}
            onChange={(e) => onChange({ ...proc, pattern: e.target.value })}
          />
          <Input
            placeholder="flags (g, i...)"
            className="text-xs"
            value={proc.flags || ""}
            onChange={(e) => onChange({ ...proc, flags: e.target.value })}
          />
          <Input
            placeholder="replacement"
            className="text-xs"
            value={proc.replacement || ""}
            onChange={(e) => onChange({ ...proc, replacement: e.target.value })}
          />
        </div>
      )}
      {proc.type === "slice" && (
        <div className="flex gap-1">
          <Input
            type="number"
            placeholder="start"
            className="text-xs"
            value={proc.start ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onChange({ ...proc, start: val ? parseInt(val) : undefined });
            }}
          />
          <Input
            type="number"
            placeholder="end"
            className="text-xs"
            value={proc.end ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onChange({ ...proc, end: val ? parseInt(val) : undefined });
            }}
          />
        </div>
      )}
    </div>
  );
}

export const PostProcessNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);
  const processors: ProcessorDef[] = config.processors || [];
  const [addType, setAddType] = useState<string>("trim");

  const updateProcessors = (newProcessors: ProcessorDef[]) => {
    updateConfig({ processors: newProcessors });
  };

  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <Wand2 className="size-4" />
        <BaseNodeHeaderTitle>后处理</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Processors</label>
          {processors.map((proc, idx) => (
            <ProcessorItem
              key={idx}
              proc={proc}
              onChange={(updated) => {
                const next = [...processors];
                next[idx] = updated;
                updateProcessors(next);
              }}
              onRemove={() => {
                updateProcessors(processors.filter((_, i) => i !== idx));
              }}
            />
          ))}
          <div className="flex gap-1">
            <Select value={addType} onValueChange={setAddType}>
              <SelectTrigger className="flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROCESSOR_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
              onClick={() => {
                updateProcessors([...processors, { type: addType }]);
              }}
            >
              <Plus className="size-3" />
              添加
            </button>
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
        id="text"
        title="text"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

PostProcessNode.displayName = "PostProcessNode";
