import { useEffect, useState } from "react";
import { Info, Save } from "lucide-react";
import { useTranslation } from 'react-i18next';
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

export function ConfigEditor() {
  const { t } = useTranslation('config');
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

  const update = (path: string[], value: unknown) => {
    setDraft(setPath(effective, path, value));
  };

  const reset = () => setDraft(null);

  const handleSave = async () => {
    if (!draft || !isDirty) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateConfig(draft);
      setDraft(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('projectSettings')}</h1>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button variant="ghost" size="sm" onClick={reset}>
                {t('undoChanges')}
              </Button>
            )}
            <Button
              size="sm"
              disabled={!isDirty || isSaving}
              title={!isDirty ? t('noChanges') : undefined}
              onClick={() => {
                void handleSave();
              }}
            >
              <Save className="mr-1.5 size-4" />
              {isSaving ? t('saving') : t('save')}
            </Button>
          </div>
        </div>

        {isDirty && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p className="text-muted-foreground">
              {t('unsavedWarning')}
            </p>
          </div>
        )}

        {saveError && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-destructive">{saveError}</p>
            </div>
          </div>
        )}

        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold">{t('section.basicInfo')}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.projectName')}</label>
                <Input value={effective.name} onChange={(e) => update(['name'], e.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.version')}</label>
                <Input value={effective.version} onChange={(e) => update(['version'], e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">{t('section.engineSettings')}</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.logLevel')}</label>
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
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.maxConcurrentFlows')}</label>
                <Input
                  type="number"
                  value={effective.engine.maxConcurrentFlows}
                  onChange={(e) => update(['engine', 'maxConcurrentFlows'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.nodeTimeout')}</label>
                <Input
                  type="number"
                  value={effective.engine.nodeTimeout}
                  onChange={(e) => update(['engine', 'nodeTimeout'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.runTimeout')}</label>
                <Input
                  type="number"
                  value={effective.engine.runTimeout}
                  onChange={(e) => update(['engine', 'runTimeout'], Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">{t('section.llmSettings')}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.provider')}</label>
                <Input value={effective.llm.provider} onChange={(e) => update(['llm', 'provider'], e.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.defaultModel')}</label>
                <Input value={effective.llm.defaultModel} onChange={(e) => update(['llm', 'defaultModel'], e.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.baseUrl')}</label>
                <Input
                  value={effective.llm.baseUrl ?? ''}
                  placeholder={t('placeholder.optional')}
                  onChange={(e) => update(['llm', 'baseUrl'], e.target.value || undefined)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.apiKey')}</label>
                <Input
                  type="password"
                  value={effective.llm.apiKey ?? ''}
                    placeholder={t('placeholder.plainTextFile')}
                  onChange={(e) => update(['llm', 'apiKey'], e.target.value || undefined)}
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">{t('section.retryStrategy')}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.maxRetries')}</label>
                <Input
                  type="number"
                  value={effective.llm.retry.maxRetries}
                  onChange={(e) => update(['llm', 'retry', 'maxRetries'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.initialDelay')}</label>
                <Input
                  type="number"
                  value={effective.llm.retry.initialDelayMs}
                  onChange={(e) => update(['llm', 'retry', 'initialDelayMs'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.maxDelay')}</label>
                <Input
                  type="number"
                  value={effective.llm.retry.maxDelayMs}
                  onChange={(e) => update(['llm', 'retry', 'maxDelayMs'], Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('field.backoffMultiplier')}</label>
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
                <label htmlFor="jitter" className="text-sm text-muted-foreground">{t('field.enableJitter')}</label>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="cache"
                  checked={effective.llm.cache.enabled}
                  onCheckedChange={(checked) => update(['llm', 'cache', 'enabled'], Boolean(checked))}
                />
                <label htmlFor="cache" className="text-sm text-muted-foreground">{t('field.enableCache')}</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
