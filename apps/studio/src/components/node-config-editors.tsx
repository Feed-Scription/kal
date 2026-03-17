import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Code, Plus, X } from "lucide-react";
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

type PromptFragmentType = "base" | "field" | "when";

type PromptFragment = {
  type?: string;
  id?: string;
  role?: string;
  content?: string;
  condition?: string;
  source?: string;
  template?: string;
  [key: string]: unknown;
};

const SUPPORTED_PROMPT_FRAGMENT_TYPES: PromptFragmentType[] = ["base", "field", "when"];

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
      role: "system",
      source: "",
      template: "",
    };
  }

  if (type === "when") {
    return {
      type,
      id: `when-${index + 1}`,
      role: "system",
      condition: "",
      content: "",
    };
  }

  return {
    type,
    id: `base-${index + 1}`,
    role: "system",
    content: "",
  };
}

function normalizePromptFragment(fragment: PromptFragment, type: PromptFragmentType): PromptFragment {
  const next: PromptFragment = {
    type,
    id: fragment.id ?? "",
    role: fragment.role ?? "system",
  };

  if (type === "field") {
    next.source = typeof fragment.source === "string" ? fragment.source : "";
    next.template = typeof fragment.template === "string" ? fragment.template : "";
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
  const fragments = useMemo(() => parsePromptFragments(value), [value]);
  const hasUnsupportedFragments = fragments.some((fragment) => !isSupportedPromptFragmentType(fragment.type));
  const [rawMode, setRawMode] = useState(hasUnsupportedFragments);
  const [rawText, setRawText] = useState(() => JSON.stringify(value ?? [], null, 2));
  const [rawError, setRawError] = useState<string | null>(null);

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
              title="切换到结构化编辑"
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
              setRawError("JSON 格式错误");
            }
          }}
        />
        {hasUnsupportedFragments && (
          <p className="text-xs text-muted-foreground">
            当前 fragments 中包含未覆盖的类型，已自动切换到 JSON 模式；清理后可回到结构化编辑。
          </p>
        )}
        {rawError ? <p className="text-xs text-destructive">{rawError}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""} ({fragments.length})
        </label>
        <button
          type="button"
          onClick={() => setRawMode(true)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title="切换到 JSON 编辑"
        >
          <Code className="size-3" />
        </button>
      </div>

      {fragments.map((fragment, index) => {
        const type = isSupportedPromptFragmentType(fragment.type) ? fragment.type : "base";
        const normalized = normalizePromptFragment(fragment, type);
        return (
          <div key={`${normalized.id || "fragment"}-${index}`} className="space-y-3 rounded-lg border bg-background/70 p-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {type}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {normalized.id || `fragment-${index + 1}`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={index === 0}
                onClick={() => onCommit(moveArrayItem(fragments, index, index - 1))}
              >
                <ArrowUp className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={index === fragments.length - 1}
                onClick={() => onCommit(moveArrayItem(fragments, index, index + 1))}
              >
                <ArrowDown className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onCommit(fragments.filter((_, currentIndex) => currentIndex !== index))}
              >
                <X className="size-3" />
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
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

              <div>
                <label className="text-xs text-muted-foreground">Role</label>
                <Input
                  className="mt-1"
                  value={normalized.role ?? ""}
                  placeholder="system"
                  onChange={(event) => {
                    commitFragment(index, { ...normalized, role: event.target.value });
                  }}
                />
              </div>
            </div>

            {type === "field" ? (
              <div className="grid gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Source</label>
                  <Input
                    className="mt-1"
                    value={normalized.source ?? ""}
                    placeholder="state.someKey"
                    onChange={(event) => {
                      commitFragment(index, { ...normalized, source: event.target.value });
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Template</label>
                  <Textarea
                    className="mt-1 text-xs"
                    rows={3}
                    value={normalized.template ?? ""}
                    onChange={(event) => {
                      commitFragment(index, { ...normalized, template: event.target.value });
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {type === "when" && (
                  <div>
                    <label className="text-xs text-muted-foreground">Condition</label>
                    <Input
                      className="mt-1"
                      value={normalized.condition ?? ""}
                      placeholder="state.questStage == 'completed'"
                      onChange={(event) => {
                        commitFragment(index, { ...normalized, condition: event.target.value });
                      }}
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground">Content</label>
                  <Textarea
                    className="mt-1 text-xs"
                    rows={5}
                    value={normalized.content ?? ""}
                    onChange={(event) => {
                      commitFragment(index, { ...normalized, content: event.target.value });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        {SUPPORTED_PROMPT_FRAGMENT_TYPES.map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCommit([...fragments, createPromptFragment(type, fragments.length)])}
          >
            <Plus className="mr-1 size-3" />
            添加 {type}
          </Button>
        ))}
      </div>
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
          {addLabel ?? "添加"}
        </Button>
      </div>
    </div>
  );
}
