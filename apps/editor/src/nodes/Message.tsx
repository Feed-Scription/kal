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
import { MessageSquare } from "lucide-react";

export const MessageNode = memo(() => {
  return (
    <BaseNode className="w-96">
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
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">User</label>
            <Textarea
              placeholder="用户消息..."
              className="mt-1"
              rows={2}
            />
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
