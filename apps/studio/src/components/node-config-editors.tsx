import { useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Code, Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type PromptFragmentType = "base" | "field" | "when" | "randomSlot" | "budget";

type PromptFragment = {
  type?: string;
  id?: string;
  content?: string;
  condition?: string;
  source?: string;
  template?: string;
  candidates?: PromptFragment[];
  seed?: "random" | number;
  maxTokens?: number;
  strategy?: "tail" | "weighted";
  weights?: Record<string, number>;
  fragments?: PromptFragment[];
  [key: string]: unknown;
};

const SUPPORTED_PROMPT_FRAGMENT_TYPES: PromptFragmentType[] = ["base", "field", "when", "randomSlot", "budget"];

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function createPromptFragment(type: PromptFragmentType, index: number): PromptFragment {
  if (type === "field") {
    return {
      type,
      id: `field-${index + 1}`,
      source: "",
      template: "",
    };
  }

  if (type === "when") {
    return {
      type,
      id: `when-${index + 1}`,
      condition: "",
      content: "",
    };
  }

  if (type === "randomSlot") {
    return {
      type,
      id: `randomSlot-${index + 1}`,
      candidates: [],
      seed: "random",
    };
  }

  if (type === "budget") {
    return {
      type,
      id: `budget-${index + 1}`,
      maxTokens: 1000,
      strategy: "tail",
      fragments: [],
    };
  }

  return {
    type,
    id: `base-${index + 1}`,
    content: "",
  };
}

function normalizePromptFragment(fragment: PromptFragment, type: PromptFragmentType): PromptFragment {
  const next: PromptFragment = {
    type,
    id: fragment.id ?? "",
  };

  if (type === "field") {
    next.source = typeof fragment.source === "string" ? fragment.source : "";
    next.template = typeof fragment.template === "string" ? fragment.template : "";
    return next;
  }

  if (type === "randomSlot") {
    next.candidates = Array.isArray(fragment.candidates) ? fragment.candidates : [];
    next.seed = fragment.seed ?? "random";
    return next;
  }

  if (type === "budget") {
    next.maxTokens = typeof fragment.maxTokens === "number" ? fragment.maxTokens : 1000;
    next.strategy = fragment.strategy === "weighted" ? "weighted" : "tail";
    next.weights = fragment.strategy === "weighted" && fragment.weights ? fragment.weights : undefined;
    next.fragments = Array.isArray(fragment.fragments) ? fragment.fragments : [];
    return next;
  }

  next.content = typeof fragment.content === "string" ? fragment.content : "";
  if (type === "when") {
    next.condition = typeof fragment.condition === "string" ? fragment.condition : "";
  }
  return next;
}

function isSupportedPromptFragmentType(value: unknown): value is PromptFragmentType {
  return typeof value === "string" && SUPPORTED_PROMPT_FRAGMENT_TYPES.includes(value as PromptFragmentType);
}

function parsePromptFragments(value: unknown): PromptFragment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is PromptFragment => typeof item === "object" && item !== null);
}

/**
 * Returns full border-left class for each fragment type.
 * IMPORTANT: Each class string must appear as a complete literal so Tailwind's
 * JIT scanner can detect and generate the corresponding CSS.
 */
function fragmentAccentClass(type: PromptFragmentType): string {
  switch (type) {
    case "base": return "border-l-2 border-l-primary";
    case "field": return "border-l-2 border-l-emerald-500";
    case "when": return "border-l-2 border-l-amber-500";
    case "randomSlot": return "border-l-2 border-l-fuchsia-500";
    case "budget": return "border-l-2 border-l-sky-500";
  }
}

/** Renders type-specific fields for a single fragment */
function FragmentTypeFields({
  type,
  normalized,
  onUpdate,
}: {
  type: PromptFragmentType;
  normalized: PromptFragment;
  onUpdate: (patch: Partial<PromptFragment>) => void;
}) {
  const { t } = useTranslation('flow');
  if (type === "field") {
    return (
      <div className="grid gap-3">
        <div>
          <label className="text-xs text-muted-foreground">{t('nodeLabel.source')}</label>
          <Input
            className="mt-1"
            value={normalized.source ?? ""}
            placeholder="state.someKey"
            onChange={(e) => onUpdate({ source: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t('nodeLabel.template')}</label>
          <Textarea
            className="mt-1 text-xs"
            rows={2}
            value={normalized.template ?? ""}
            onChange={(e) => onUpdate({ template: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (type === "randomSlot") {
    const candidates = normalized.candidates ?? [];
    const seedValue = normalized.seed ?? "random";
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">{t('nodeLabel.seed')}</label>
            <Select
              value={typeof seedValue === "number" ? "fixed" : "random"}
              onValueChange={(v) => onUpdate({ seed: v === "random" ? "random" : 0 })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random">random</SelectItem>
                <SelectItem value="fixed">fixed index</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {typeof seedValue === "number" && (
            <div>
              <label className="text-xs text-muted-foreground">{t('nodeLabel.index')}</label>
              <Input
                type="number"
                className="mt-1"
                value={seedValue}
                min={0}
                onChange={(e) => onUpdate({ seed: Number(e.target.value) })}
              />
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            Candidates ({candidates.length})
          </label>
          <div className="mt-1 space-y-2">
            {candidates.map((cand, ci) => (
              <div key={ci} className="flex items-start gap-1 rounded border bg-muted/30 p-2">
                <Textarea
                  className="flex-1 font-mono text-xs"
                  rows={2}
                  value={cand.content ?? JSON.stringify(cand, null, 2)}
                  onChange={(e) => {
                    const next = [...candidates];
                    next[ci] = { type: "base", id: `cand-${ci + 1}`, content: e.target.value };
                    onUpdate({ candidates: next });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => onUpdate({ candidates: candidates.filter((_, i) => i !== ci) })}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                onUpdate({
                  candidates: [
                    ...candidates,
                    { type: "base", id: `cand-${candidates.length + 1}`, content: "" },
                  ],
                })
              }
            >
              <Plus className="mr-1 size-3" />
              {t('addCandidate')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (type === "budget") {
    const subFragments = normalized.fragments ?? [];
    const weights = normalized.weights ?? {};
    const [weightKey, setWeightKey] = useState("");
    const [weightVal, setWeightVal] = useState("");
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Max Tokens</label>
            <Input
              type="number"
              className="mt-1"
              value={normalized.maxTokens ?? 1000}
              min={1}
              onChange={(e) => onUpdate({ maxTokens: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('nodeLabel.strategy')}</label>
            <Select
              value={normalized.strategy ?? "tail"}
              onValueChange={(v) => onUpdate({ strategy: v as "tail" | "weighted" })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tail">tail</SelectItem>
                <SelectItem value="weighted">weighted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {normalized.strategy === "weighted" && (
          <div>
            <label className="text-xs text-muted-foreground">
              Weights ({Object.keys(weights).length})
            </label>
            <div className="mt-1 space-y-1">
              {Object.entries(weights).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate rounded border bg-muted px-2 py-1 font-mono text-xs">
                    {k}
                  </span>
                  <Input
                    type="number"
                    className="w-20 text-xs"
                    value={v}
                    step={0.1}
                    onChange={(e) => {
                      const next = { ...weights, [k]: Number(e.target.value) };
                      onUpdate({ weights: next });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      const next = { ...weights };
                      delete next[k];
                      onUpdate({ weights: next });
                    }}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-1">
                <Input
                  className="flex-1 text-xs"
                  placeholder="fragment id"
                  value={weightKey}
                  onChange={(e) => setWeightKey(e.target.value)}
                />
                <Input
                  type="number"
                  className="w-20 text-xs"
                  placeholder="1.0"
                  value={weightVal}
                  step={0.1}
                  onChange={(e) => setWeightVal(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!weightKey.trim()) return;
                    onUpdate({ weights: { ...weights, [weightKey.trim()]: Number(weightVal) || 1 } });
                    setWeightKey("");
                    setWeightVal("");
                  }}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">
            Sub-fragments ({subFragments.length})
          </label>
          <div className="mt-1 space-y-2">
            {subFragments.map((sf, si) => (
              <div key={si} className="flex items-start gap-1 rounded border bg-muted/30 p-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {sf.type ?? "base"}
                    </span>
                    <Input
                      className="h-6 flex-1 text-xs"
                      placeholder="id"
                      value={sf.id ?? ""}
                      onChange={(e) => {
                        const next = [...subFragments];
                        next[si] = { ...sf, id: e.target.value };
                        onUpdate({ fragments: next });
                      }}
                    />
                  </div>
                  <Textarea
                    className="font-mono text-xs"
                    rows={2}
                    value={sf.content ?? JSON.stringify(sf, null, 2)}
                    onChange={(e) => {
                      const next = [...subFragments];
                      next[si] = { type: "base", id: sf.id ?? `sub-${si + 1}`, content: e.target.value };
                      onUpdate({ fragments: next });
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => onUpdate({ fragments: subFragments.filter((_, i) => i !== si) })}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                onUpdate({
                  fragments: [
                    ...subFragments,
                    { type: "base", id: `sub-${subFragments.length + 1}`, content: "" },
                  ],
                })
              }
            >
              <Plus className="mr-1 size-3" />
              {t('addSubFragment')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // base / when
  return (
    <div className="grid gap-3">
      {type === "when" && (
        <div>
          <label className="text-xs text-muted-foreground">{t('nodeLabel.condition')}</label>
          <Input
            className="mt-1"
            value={normalized.condition ?? ""}
            placeholder="state.questStage == 'completed'"
            onChange={(e) => onUpdate({ condition: e.target.value })}
          />
        </div>
      )}
      <div>
        <label className="text-xs text-muted-foreground">{t('nodeLabel.content')}</label>
        <Textarea
          className="mt-1 text-xs"
          rows={3}
          value={normalized.content ?? ""}
          onChange={(e) => onUpdate({ content: e.target.value })}
        />
      </div>
    </div>
  );
}

export function PromptBuildFragmentsField({
  label,
  required,
  value,
  onCommit,
}: {
  label: string;
  required: boolean;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const { t } = useTranslation('flow');
  const fragments = useMemo(() => parsePromptFragments(value), [value]);
  const hasUnsupportedFragments = fragments.some((fragment) => !isSupportedPromptFragmentType(fragment.type));
  const [rawMode, setRawMode] = useState(hasUnsupportedFragments);
  const [rawText, setRawText] = useState(() => JSON.stringify(value ?? [], null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());

  const toggleExpanded = (index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addFragment = (type: PromptFragmentType) => {
    const newIndex = fragments.length;
    onCommit([...fragments, createPromptFragment(type, newIndex)]);
    setExpandedSet((prev) => new Set(prev).add(newIndex));
  };

  useEffect(() => {
    setRawMode(hasUnsupportedFragments);
    setRawText(JSON.stringify(value ?? [], null, 2));
    setRawError(null);
  }, [hasUnsupportedFragments, value]);

  const commitFragment = (index: number, fragment: PromptFragment) => {
    const next = [...fragments];
    next[index] = fragment;
    onCommit(next);
  };

  if (rawMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">
            {label} {required ? "*" : ""} ({fragments.length})
          </label>
          {!hasUnsupportedFragments && (
            <button
              type="button"
              onClick={() => setRawMode(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              title={t('switchToStructured')}
            >
              <Code className="size-3" />
            </button>
          )}
        </div>
        <Textarea
          className="font-mono text-xs"
          rows={8}
          value={rawText}
          onChange={(event) => {
            setRawText(event.target.value);
            setRawError(null);
          }}
          onBlur={() => {
            try {
              onCommit(JSON.parse(rawText));
              setRawError(null);
            } catch {
              setRawError(t('jsonFormatError'));
            }
          }}
        />
        {hasUnsupportedFragments && (
          <p className="text-xs text-muted-foreground">
            {t('unsupportedFragments')}
          </p>
        )}
        {rawError ? <p className="text-xs text-destructive">{rawError}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""} ({fragments.length})
        </label>
        <button
          type="button"
          onClick={() => setRawMode(true)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title={t('switchToJson')}
        >
          <Code className="size-3" />
        </button>
      </div>

      {fragments.map((fragment, index) => {
        const type = isSupportedPromptFragmentType(fragment.type) ? fragment.type : "base";
        const normalized = normalizePromptFragment(fragment, type);
        const isExpanded = expandedSet.has(index);
        return (
          <div key={`${normalized.id || "fragment"}-${index}`} className={`group/frag rounded-lg border ${fragmentAccentClass(type)} bg-background/70`}>
            {/* Header row — always visible */}
            <div
              className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5"
              onClick={() => toggleExpanded(index)}
            >
              {isExpanded
                ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
              {!isExpanded && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {type}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {normalized.id || `fragment-${index + 1}`}
              </span>
              <div className="flex shrink-0 opacity-0 transition-opacity group-hover/frag:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === 0}
                  onClick={(e) => { e.stopPropagation(); onCommit(moveArrayItem(fragments, index, index - 1)); }}
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === fragments.length - 1}
                  onClick={(e) => { e.stopPropagation(); onCommit(moveArrayItem(fragments, index, index + 1)); }}
                >
                  <ArrowDown className="size-3" />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={(e) => { e.stopPropagation(); onCommit(fragments.filter((_, ci) => ci !== index)); }}
              >
                <X className="size-3" />
              </Button>
            </div>

            {/* Expanded form */}
            {isExpanded && (
              <div className="space-y-3 border-t px-3 pb-3 pt-2">
                <div className="grid gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">{t('nodeLabel.type')}</label>
                    <Select
                      value={type}
                      onValueChange={(nextType: PromptFragmentType) => {
                        commitFragment(index, normalizePromptFragment(normalized, nextType));
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_PROMPT_FRAGMENT_TYPES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Id</label>
                  <Input
                    className="mt-1"
                    value={normalized.id ?? ""}
                    onChange={(event) => {
                      commitFragment(index, { ...normalized, id: event.target.value });
                    }}
                  />
                </div>

                <FragmentTypeFields
                  type={type}
                  normalized={normalized}
                  onUpdate={(patch) => commitFragment(index, { ...normalized, ...patch })}
                />
              </div>
            )}
          </div>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Plus className="mr-1 size-3" />
            {t('addFragment')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SUPPORTED_PROMPT_FRAGMENT_TYPES.map((type) => (
            <DropdownMenuItem key={type} onClick={() => addFragment(type)}>
              {t('addType', { type })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function StringListField({
  label,
  required,
  value,
  placeholder,
  addLabel,
  onCommit,
}: {
  label: string;
  required: boolean;
  value: unknown;
  placeholder?: string;
  addLabel?: string;
  onCommit: (value: unknown) => void;
}) {
  const { t } = useTranslation('flow');
  const items = useMemo(
    () => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []),
    [value],
  );
  const [pendingValue, setPendingValue] = useState("");

  const addItem = () => {
    const nextValue = pendingValue.trim();
    if (!nextValue) {
      return;
    }
    onCommit([...items, nextValue]);
    setPendingValue("");
  };

  return (
    <div className="space-y-3">
      <label className="text-xs text-muted-foreground">
        {label} {required ? "*" : ""} ({items.length})
      </label>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="flex items-center gap-1">
            <Input
              className="flex-1 text-xs"
              value={item}
              onChange={(event) => {
                const next = [...items];
                next[index] = event.target.value;
                onCommit(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={index === 0}
              onClick={() => onCommit(moveArrayItem(items, index, index - 1))}
            >
              <ArrowUp className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={index === items.length - 1}
              onClick={() => onCommit(moveArrayItem(items, index, index + 1))}
            >
              <ArrowDown className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onCommit(items.filter((_, currentIndex) => currentIndex !== index))}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          className="text-xs"
          value={pendingValue}
          placeholder={placeholder}
          onChange={(event) => setPendingValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="mr-1 size-3" />
          {addLabel ?? t('add')}
        </Button>
      </div>
    </div>
  );
}

// ── WriteState structured editors ──

const WRITE_STATE_OPERATIONS = ["set", "append", "appendMany", "increment"] as const;

/**
 * Per-key operation type selector for WriteState `operations` config.
 * Renders each allowedKey as a row with a dropdown to pick set/append/appendMany/increment.
 */
export function WriteStateOperationsField({
  label,
  required,
  value,
  allowedKeys,
  onCommit,
}: {
  label: string;
  required: boolean;
  value: unknown;
  allowedKeys: string[];
  onCommit: (value: unknown) => void;
}) {
  const { t } = useTranslation('flow');
  const ops = useMemo(
    () => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {}),
    [value],
  );

  const update = (key: string, op: string) => {
    const next = { ...ops };
    if (op === "set") {
      delete next[key];
    } else {
      next[key] = op;
    }
    onCommit(next);
  };

  if (allowedKeys.length === 0) {
    return (
      <div>
        <label className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{t('addAllowedKeysFirst')}</p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground">
        {label} {required ? "*" : ""}
      </label>
      <div className="mt-1 space-y-1">
        {allowedKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded border bg-muted px-2 py-1 font-mono text-xs">
              {key}
            </span>
            <Select
              value={ops[key] ?? "set"}
              onValueChange={(v) => update(key, v)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WRITE_STATE_OPERATIONS.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-key min/max constraint editor for WriteState `constraints` config.
 */
export function WriteStateConstraintsField({
  label,
  required,
  value,
  allowedKeys,
  onCommit,
}: {
  label: string;
  required: boolean;
  value: unknown;
  allowedKeys: string[];
  onCommit: (value: unknown) => void;
}) {
  const { t } = useTranslation('flow');
  const constraints = useMemo(
    () =>
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, { min?: number; max?: number }>)
        : {},
    [value],
  );

  const update = (key: string, field: "min" | "max", val: string) => {
    const existing = constraints[key] ?? {};
    const next = { ...constraints };
    if (val === "") {
      const patched = { ...existing };
      delete patched[field];
      if (Object.keys(patched).length === 0) {
        delete next[key];
      } else {
        next[key] = patched;
      }
    } else {
      next[key] = { ...existing, [field]: Number(val) };
    }
    onCommit(next);
  };

  if (allowedKeys.length === 0) {
    return (
      <div>
        <label className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{t('addAllowedKeysConstraints')}</p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground">
        {label} {required ? "*" : ""}
      </label>
      <div className="mt-1 space-y-1">
        {allowedKeys.map((key) => {
          const c = constraints[key] ?? {};
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded border bg-muted px-2 py-1 font-mono text-xs">
                {key}
              </span>
              <Input
                type="number"
                className="w-20 text-xs"
                placeholder="min"
                value={c.min ?? ""}
                onChange={(e) => update(key, "min", e.target.value)}
              />
              <Input
                type="number"
                className="w-20 text-xs"
                placeholder="max"
                value={c.max ?? ""}
                onChange={(e) => update(key, "max", e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Per-key dedup field editor for WriteState `deduplicateBy` config.
 */
export function WriteStateDeduplicateByField({
  label,
  required,
  value,
  allowedKeys,
  operations,
  onCommit,
}: {
  label: string;
  required: boolean;
  value: unknown;
  allowedKeys: string[];
  operations: Record<string, string>;
  onCommit: (value: unknown) => void;
}) {
  const { t } = useTranslation('flow');
  const dedup = useMemo(
    () =>
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, string>)
        : {},
    [value],
  );

  // Only show keys that use appendMany
  const appendManyKeys = allowedKeys.filter((k) => operations[k] === "appendMany");

  const update = (key: string, field: string) => {
    const next = { ...dedup };
    if (!field) {
      delete next[key];
    } else {
      next[key] = field;
    }
    onCommit(next);
  };

  if (appendManyKeys.length === 0) {
    return (
      <div>
        <label className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{t('onlyAppendMany')}</p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground">
        {label} {required ? "*" : ""}
      </label>
      <div className="mt-1 space-y-1">
        {appendManyKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded border bg-muted px-2 py-1 font-mono text-xs">
              {key}
            </span>
            <Input
              className="w-36 text-xs"
              placeholder={t('dedupPlaceholder')}
              value={dedup[key] ?? ""}
              onChange={(e) => update(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
