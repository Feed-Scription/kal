import { memo } from "react";
import { useTranslation } from "react-i18next";
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
import { Square } from "lucide-react";
import { overlayClassName } from "@/hooks/use-node-overlay";
import { NodeOverlayBadge } from "@/components/NodeOverlayBadge";
import type { NodeOverlayState } from "@/hooks/use-node-overlay";

export const EndStepNode = memo(({ id, data }: NodeProps) => {
  const { t } = useTranslation('session');
  const config = (data as any).config || {};
  const overlay = (data as any).overlay as NodeOverlayState | undefined;
  const { updateConfig } = useNodeConfig(id);

  return (
    <BaseNode className={`w-64 ${overlayClassName(overlay)}`}>
      <NodeOverlayBadge overlay={overlay} />
      <BaseNodeHeader className="border-b bg-red-50 dark:bg-red-950/30">
        <Square className="size-4 text-red-600" />
        <BaseNodeHeaderTitle>{t('stepTypes.End')}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div>
          <label className="text-xs text-muted-foreground">{t('node.endMessage')}</label>
          <Input
            placeholder={t('node.endMessagePlaceholder')}
            className="mt-1"
            value={config.message || ""}
            onChange={(e) => updateConfig({ message: e.target.value })}
          />
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="target"
        title={t('node.entry')}
        type="target"
        position={Position.Left}
      />
    </BaseNode>
  );
});

EndStepNode.displayName = "EndStepNode";
