import { useEffect, useMemo, useState } from "react";
import { Info, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStudioCommands, useStudioResources } from "@/kernel/hooks";
import type { KalConfig } from "@/types/project";

/** 深拷贝 + 按路径设值 */
function setPath(obj: KalConfig, path: string[], value: unknown): KalConfig {
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, any>;
  let cursor: Record<string, any> = clone;
  for (let i = 0; i < path.length - 1; i++) {
    cursor = cursor[path[i]];
  }
  cursor[path[path.length - 1]] = value;
  return clone as KalConfig;
}

function sanitizeConfigForSave(draft: KalConfig, current: KalConfig): KalConfig {
  return {
    ...draft,
    llm: {
      ...draft.llm,
      apiKey: current.llm.apiKey,
      baseUrl: current.llm.baseUrl,
    },
  };
}

export function ConfigEditor() {
  const { config } = useStudioResources();
  const { updateConfig } = useStudioCommands();
  const [draft, setDraft] = useState<KalConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
    setSaveError(null);
    setIsSaving(false);
  }, [config]);

  const effective = draft ?? config;
  if (!effective) return null;

  const isDirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(config);
  const sanitizedDraft = useMemo(() => {
    if (!draft || !config) return null;
    return sanitizeConfigForSave(draft, config);
  }, [config, draft]);
  const hasRestrictedChanges = Boolean(
    draft &&
      config &&
      (draft.llm.apiKey !== config.llm.apiKey || draft.llm.baseUrl !== config.llm.baseUrl)
  );
  const hasPersistableChanges = Boolean(
    sanitizedDraft && config && JSON.stringify(sanitizedDraft) !== JSON.stringify(config)
  );

  const update = (path: string[], value: unknown) => {
    setDraft(setPath(effective, path, value));
  };

  const reset = () => setDraft(null);

  const handleSave = async () => {
    if (!config || !sanitizedDraft || !hasPersistableChanges) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateConfig(sanitizedDraft);
      setDraft(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存配置失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">项目设置</h1>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button variant="ghost" size="sm" onClick={reset}>
                撤销修改
              </Button>
            )}
            <Button
              size="sm"
              disabled={!hasPersistableChanges || isSaving}
              title={
                !isDirty
                  ? "没有修改"
                  : !hasPersistableChanges
                    ? "当前仅修改了暂不支持直接保存的字段"
                    : undefined
              }
              onClick={() => {
                void handleSave();
              }}
            >
              <Save className="mr-1.5 size-4" />
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>

        {isDirty && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p className="text-muted-foreground">
              配置已修改但尚未保存。保存会直接调用 Studio 的配置写入命令，并进入版本记录，可撤销重做。
            </p>
          </div>
        )}

        {(hasRestrictedChanges || saveError) && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
            {hasRestrictedChanges && (
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
                <p className="text-muted-foreground">
                  `llm.apiKey` 和 `llm.baseUrl` 目前不能通过 Studio 直接保存。你可以在这里查看或临时编辑，但保存时会保留项目文件中的原值。
                </p>
              </div>
            )}
            {saveError && (
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-destructive">{saveError}</p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold">基本信息</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">项目名称</label>
                <Input value={effective.name} onChange={(e) => update(['name'], e.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">版本</label>
                <Input value={effective.version} onChange={(e) => update(['version'], e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">引擎设置</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">日志级别</label>
                <Select value={effective.engine.logLevel} onValueChange={(v) => update(['engine', 'logLevel'], v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['debug', 'info', 'warn', 'error'].map((level) => (
                      <SelectItem key={level} value={level}>{level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">最大并发 Flow</label>
                <Input
                  type="number"
                  value={effective.engine.maxConcurrentFlows}
                  onChange={(e) => update(['engine', 'maxConcurrentFlows'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">超时 (ms)</label>
                <Input
                  type="number"
                  value={effective.engine.timeout}
                  onChange={(e) => update(['engine', 'timeout'], Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">LLM 设置</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Provider</label>
                <Input value={effective.llm.provider} onChange={(e) => update(['llm', 'provider'], e.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">默认模型</label>
                <Input value={effective.llm.defaultModel} onChange={(e) => update(['llm', 'defaultModel'], e.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Base URL</label>
                <Input
                  value={effective.llm.baseUrl ?? ''}
                  placeholder="可选"
                  onChange={(e) => update(['llm', 'baseUrl'], e.target.value || undefined)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">API Key</label>
                <Input
                  type="password"
                  value={effective.llm.apiKey ?? ''}
                  placeholder="已加密存储"
                  onChange={(e) => update(['llm', 'apiKey'], e.target.value || undefined)}
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">重试策略</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">最大重试次数</label>
                <Input
                  type="number"
                  value={effective.llm.retry.maxRetries}
                  onChange={(e) => update(['llm', 'retry', 'maxRetries'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">初始延迟 (ms)</label>
                <Input
                  type="number"
                  value={effective.llm.retry.initialDelayMs}
                  onChange={(e) => update(['llm', 'retry', 'initialDelayMs'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">最大延迟 (ms)</label>
                <Input
                  type="number"
                  value={effective.llm.retry.maxDelayMs}
                  onChange={(e) => update(['llm', 'retry', 'maxDelayMs'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">退避倍数</label>
                <Input
                  type="number"
                  step="0.1"
                  value={effective.llm.retry.backoffMultiplier}
                  onChange={(e) => update(['llm', 'retry', 'backoffMultiplier'], Number(e.target.value))}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="jitter"
                  checked={effective.llm.retry.jitter}
                  onCheckedChange={(checked) => update(['llm', 'retry', 'jitter'], Boolean(checked))}
                />
                <label htmlFor="jitter" className="text-sm text-muted-foreground">启用 Jitter</label>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="cache"
                  checked={effective.llm.cache.enabled}
                  onCheckedChange={(checked) => update(['llm', 'cache', 'enabled'], Boolean(checked))}
                />
                <label htmlFor="cache" className="text-sm text-muted-foreground">启用缓存</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
