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
import { Checkbox } from "@/components/ui/checkbox";
import { useNodeConfig } from "@/hooks/use-node-config";
import { Sparkles, ChevronDown, ChevronRight } from "lucide-react";

export const GenerateTextNode = memo(({ id, data, selected }: NodeProps) => {
  const config = (data as any).config || {};
  const { updateConfig } = useNodeConfig(id);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const retry = config.retry || {};
  const cache = config.cache || {};

  return (
    <BaseNode className={`w-80 ${selected ? 'ring-2 ring-primary' : ''}`}>
      <BaseNodeHeader className="border-b">
        <Sparkles className="size-4" />
        <BaseNodeHeaderTitle>生成文本</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Model</label>
            <Input
              placeholder="gpt-4"
              className="mt-1"
              value={config.model || ""}
              onChange={(e) => updateConfig({ model: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Temperature</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="2"
              placeholder="0.7"
              className="mt-1"
              value={config.temperature ?? 0.7}
              onChange={(e) => updateConfig({ temperature: parseFloat(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Max Tokens</label>
            <Input
              type="number"
              placeholder="2000"
              className="mt-1"
              value={config.maxTokens ?? 2000}
              onChange={(e) => updateConfig({ maxTokens: parseInt(e.target.value) })}
            />
          </div>

          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            高级选项
          </button>

          {showAdvanced && (
            <div className="space-y-3 rounded border p-2">
              <div>
                <label className="text-xs font-medium">Retry</label>
                <div className="mt-1 space-y-1">
                  <div>
                    <label className="text-xs text-muted-foreground">Max Retries</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="3"
                      className="mt-0.5"
                      value={retry.maxRetries ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateConfig({
                          retry: { ...retry, maxRetries: val ? parseInt(val) : undefined },
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Initial Delay (ms)</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="1000"
                      className="mt-0.5"
                      value={retry.initialDelayMs ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateConfig({
                          retry: { ...retry, initialDelayMs: val ? parseInt(val) : undefined },
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Max Delay (ms)</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="30000"
                      className="mt-0.5"
                      value={retry.maxDelayMs ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateConfig({
                          retry: { ...retry, maxDelayMs: val ? parseInt(val) : undefined },
                        });
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium">Cache</label>
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-cache-enabled`}
                      checked={cache.enabled ?? false}
                      onCheckedChange={(checked) =>
                        updateConfig({ cache: { ...cache, enabled: !!checked } })
                      }
                    />
                    <label htmlFor={`${id}-cache-enabled`} className="text-xs">
                      启用缓存
                    </label>
                  </div>
                  {cache.enabled && (
                    <>
                      <div>
                        <label className="text-xs text-muted-foreground">TTL (ms)</label>
                        <Input
                          type="number"
                          min="0"
                          placeholder="60000"
                          className="mt-0.5"
                          value={cache.ttl ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateConfig({
                              cache: { ...cache, ttl: val ? parseInt(val) : undefined },
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Max Entries</label>
                        <Input
                          type="number"
                          min="0"
                          placeholder="100"
                          className="mt-0.5"
                          value={cache.maxEntries ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateConfig({
                              cache: { ...cache, maxEntries: val ? parseInt(val) : undefined },
                            });
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </BaseNodeContent>
      <LabeledHandle
        id="messages"
        title="messages"
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
        id="usage"
        title="usage"
        type="source"
        position={Position.Right}
        labelClassName="flex-1 text-right"
      />
    </BaseNode>
  );
});

GenerateTextNode.displayName = "GenerateTextNode";
