import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { HandleDefinition, ProjectState } from '@/types/project';

export function EvalEnvironmentSection({
  flowInputs,
  inputValues,
  stateOverrides,
  runtimeState,
  onInputChange,
  onStateChange,
}: {
  flowInputs: HandleDefinition[];
  inputValues: Record<string, unknown>;
  stateOverrides: Record<string, unknown>;
  runtimeState: ProjectState;
  onInputChange: (values: Record<string, unknown>) => void;
  onStateChange: (overrides: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation('eval');
  const stateKeys = Object.keys(runtimeState);
  const [open, setOpen] = useState(false);

  const overrideCount = Object.keys(stateOverrides).length;
  const hasContent = flowInputs.length > 0 || stateKeys.length > 0;

  const updateInput = (name: string, value: unknown) => {
    onInputChange({ ...inputValues, [name]: value });
  };

  const toggleOverride = (key: string, enabled: boolean) => {
    if (enabled) {
      const sv = runtimeState[key];
      onStateChange({ ...stateOverrides, [key]: sv?.value ?? '' });
    } else {
      const next = { ...stateOverrides };
      delete next[key];
      onStateChange(next);
    }
  };

  const updateOverride = (key: string, value: unknown) => {
    onStateChange({ ...stateOverrides, [key]: value });
  };

  /** Inline capsule for simple types, block for object/array */
  const renderInputCapsule = (input: HandleDefinition) => {
    const val = inputValues[input.name];

    if (input.type === 'boolean') {
      return (
        <label
          key={input.name}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] transition-colors hover:bg-muted/50"
        >
          <Checkbox
            id={`input-${input.name}`}
            checked={val === true}
            onCheckedChange={(checked) => updateInput(input.name, checked === true)}
            className="size-3"
          />
          <span>{input.name}</span>
          {input.required && <span className="text-destructive">*</span>}
        </label>
      );
    }

    if (input.type === 'object' || input.type === 'array') {
      return (
        <div className="w-full space-y-1" key={input.name}>
          <Label className="text-[11px]">
            {input.name}
            {input.required && <span className="text-destructive"> *</span>}
            <span className="ml-1 text-muted-foreground/60">({input.type})</span>
          </Label>
          <Textarea
            className="min-h-[60px] font-mono text-xs"
            value={typeof val === 'string' ? val : (val !== undefined ? JSON.stringify(val, null, 2) : '')}
            onChange={(e) => {
              try { updateInput(input.name, JSON.parse(e.target.value)); }
              catch { updateInput(input.name, e.target.value); }
            }}
          />
        </div>
      );
    }

    // string / number — inline capsule with embedded input
    return (
      <div
        key={input.name}
        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-[11px] transition-colors hover:bg-muted/50"
      >
        <span className="shrink-0 text-muted-foreground">
          {input.name}
          {input.required && <span className="text-destructive">*</span>}
        </span>
        <Input
          type={input.type === 'number' ? 'number' : 'text'}
          className="h-5 w-24 border-0 bg-transparent px-1 text-[11px] shadow-none focus-visible:ring-0"
          value={input.type === 'number'
            ? (typeof val === 'number' ? val : '')
            : (typeof val === 'string' ? val : '')}
          placeholder={input.defaultValue !== undefined ? String(input.defaultValue) : '…'}
          onChange={(e) => {
            if (input.type === 'number') {
              updateInput(input.name, e.target.value === '' ? undefined : Number(e.target.value));
            } else {
              updateInput(input.name, e.target.value);
            }
          }}
        />
      </div>
    );
  };

  return (
    <section className="rounded-xl border bg-card">
      {/* Collapsible header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        {open
          ? <ChevronDown className="size-3.5 text-muted-foreground" />
          : <ChevronRight className="size-3.5 text-muted-foreground" />}
        <Settings2 className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{t('environment.title')}</span>
        {!open && overrideCount > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {overrideCount} override{overrideCount > 1 ? 's' : ''}
          </span>
        )}
        {!open && !hasContent && (
          <span className="text-[11px] text-muted-foreground/60 italic">
            {t('environment.noInputsDeclared')}
          </span>
        )}
      </button>

      {/* Body */}
      {open && (
        <div className="space-y-3 border-t px-4 pb-4 pt-3">
          {/* Inputs — flex wrap capsules */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">{t('environment.inputsTitle')}</div>
            {flowInputs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">{t('environment.noInputsDeclared')}</p>
            ) : (
              <div className="flex flex-wrap items-start gap-1.5">
                {flowInputs.map(renderInputCapsule)}
              </div>
            )}
          </div>

          {/* State Overrides — separate block */}
          {stateKeys.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t('environment.stateTitle')}
                <span className="ml-1 text-muted-foreground/60">({stateKeys.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {stateKeys.map((key) => {
                  const sv = runtimeState[key]!;
                  const isOverridden = key in stateOverrides;
                  const displayValue = typeof sv.value === 'string' ? sv.value : JSON.stringify(sv.value);
                  const shortValue = displayValue.length > 30 ? displayValue.slice(0, 30) + '…' : displayValue;

                  if (isOverridden) {
                    return (
                      <div
                        key={key}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px]"
                      >
                        <Checkbox
                          id={`state-${key}`}
                          checked
                          onCheckedChange={() => toggleOverride(key, false)}
                          className="size-3"
                        />
                        <span className="shrink-0 font-mono text-foreground/80">{key}</span>
                        <Input
                          className="h-5 w-24 border-0 bg-transparent px-1 font-mono text-[11px] shadow-none focus-visible:ring-0"
                          value={typeof stateOverrides[key] === 'string'
                            ? stateOverrides[key] as string
                            : JSON.stringify(stateOverrides[key])}
                          onChange={(e) => {
                            try { updateOverride(key, JSON.parse(e.target.value)); }
                            catch { updateOverride(key, e.target.value); }
                          }}
                        />
                      </div>
                    );
                  }

                  return (
                    <button
                      key={key}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground"
                      onClick={() => toggleOverride(key, true)}
                      title={displayValue}
                    >
                      <span className="font-mono">{key}</span>
                      <span className="text-muted-foreground/50">= {shortValue}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
