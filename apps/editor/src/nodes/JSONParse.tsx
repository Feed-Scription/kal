import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Checkbox } from "@/components/ui/checkbox";
import { useNodeConfig } from "@/hooks/use-node-config";
import { Braces } from "lucide-react";

export const JSONParseNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);

  return (
    <BaseNode className="w-80">
      <BaseNodeHeader className="border-b">
        <Braces className="size-4" />
        <BaseNodeHeaderTitle>JSON 解析</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-extract`}
              checked={config.extractFromCodeBlock ?? true}
              onCheckedChange={(checked) =>
                updateConfig({ extractFromCodeBlock: !!checked })
              }
            />
            <label htmlFor={`${id}-extract`} className="text-xs">
              从代码块提取
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-fix-errors`}
              checked={config.fixCommonErrors ?? true}
              onCheckedChange={(checked) =>
                updateConfig({ fixCommonErrors: !!checked })
              }
            />
            <label htmlFor={`${id}-fix-errors`} className="text-xs">
              修复常见错误
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-fix-truncated`}
              checked={config.fixTruncated ?? true}
              onCheckedChange={(checked) =>
                updateConfig({ fixTruncated: !!checked })
              }
            />
            <label htmlFor={`${id}-fix-truncated`} className="text-xs">
              修复截断的 JSON
            </label>
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
