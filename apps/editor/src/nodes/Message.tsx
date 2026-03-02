import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNodeConfig } from "@/hooks/use-node-config";
import { MessageSquare } from "lucide-react";

export const MessageNode = memo(({ id, data, selected }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);

  return (
    <BaseNode className={`w-96 ${selected ? 'ring-2 ring-primary' : ''}`}>
      <BaseNodeHeader className="border-b">
        <MessageSquare className="size-4" />
        <BaseNodeHeaderTitle>消息组装</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">System</label>
            <Textarea
              placeholder="系统提示词..."
              className="mt-1"
              rows={2}
              value={config.system || ""}
              onChange={(e) => updateConfig({ system: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">User</label>
            <Textarea
              placeholder="用户消息..."
              className="mt-1"
              rows={2}
              value={config.user || ""}
              onChange={(e) => updateConfig({ user: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Format</label>
            <Select
              value={config.format || "xml"}
              onValueChange={(val) => updateConfig({ format: val })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xml">XML</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="system"
        title="system"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="user"
        title="user"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="history"
        title="history"
        type="target"
        position={Position.Left}
      />
      <LabeledHandle
        id="messages"
        title="messages"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

MessageNode.displayName = "MessageNode";
