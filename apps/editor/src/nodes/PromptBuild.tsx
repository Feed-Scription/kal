import { memo, useState, useCallback } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Textarea } from "@/components/ui/textarea";
import { useNodeConfig } from "@/hooks/use-node-config";
import { FileText } from "lucide-react";

export const PromptBuildNode = memo(({ id, data }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(config.fragments || [], null, 2)
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const handleBlur = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        setParseError("必须是数组");
        return;
      }
      setParseError(null);
      updateConfig({ fragments: parsed });
    } catch {
      setParseError("JSON 格式错误");
    }
  }, [jsonText, updateConfig]);

  return (
    <BaseNode className="w-96">
      <BaseNodeHeader className="border-b">
        <FileText className="size-4" />
        <BaseNodeHeaderTitle>Prompt 构建</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div>
          <label className="text-xs text-muted-foreground">
            Fragments (JSON)
          </label>
          <Textarea
            placeholder='[{"type":"base","text":"..."}]'
            className="mt-1 font-mono text-xs"
            rows={6}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setParseError(null);
            }}
            onBlur={handleBlur}
          />
          {parseError && (
            <p className="mt-1 text-xs text-destructive">{parseError}</p>
          )}
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
