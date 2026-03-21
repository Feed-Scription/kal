export type PromptFragmentType = "base" | "field" | "when" | "randomSlot" | "budget";

export type PromptFragment = {
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

export const SUPPORTED_PROMPT_FRAGMENT_TYPES: PromptFragmentType[] = ["base", "field", "when", "randomSlot", "budget"];

export function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function createPromptFragment(type: PromptFragmentType, index: number): PromptFragment {
  if (type === "field") {
    return { type, id: `field-${index + 1}`, source: "", template: "" };
  }
  if (type === "when") {
    return { type, id: `when-${index + 1}`, condition: "", content: "" };
  }
  if (type === "randomSlot") {
    return { type, id: `randomSlot-${index + 1}`, candidates: [], seed: "random" };
  }
  if (type === "budget") {
    return { type, id: `budget-${index + 1}`, maxTokens: 1000, strategy: "tail", fragments: [] };
  }
  return { type, id: `base-${index + 1}`, content: "" };
}

export function normalizePromptFragment(fragment: PromptFragment, type: PromptFragmentType): PromptFragment {
  const next: PromptFragment = { type, id: fragment.id ?? "" };

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

export function isSupportedPromptFragmentType(value: unknown): value is PromptFragmentType {
  return typeof value === "string" && SUPPORTED_PROMPT_FRAGMENT_TYPES.includes(value as PromptFragmentType);
}

export function parsePromptFragments(value: unknown): PromptFragment[] {
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
export function fragmentAccentClass(type: PromptFragmentType): string {
  switch (type) {
    case "base": return "border-l-2 border-l-primary";
    case "field": return "border-l-2 border-l-emerald-500";
    case "when": return "border-l-2 border-l-amber-500";
    case "randomSlot": return "border-l-2 border-l-fuchsia-500";
    case "budget": return "border-l-2 border-l-sky-500";
  }
}

/**
 * Returns badge color classes for each fragment type.
 * IMPORTANT: Each class string must appear as a complete literal so Tailwind's
 * JIT scanner can detect and generate the corresponding CSS.
 */
export function fragmentBadgeClass(type: PromptFragmentType): string {
  switch (type) {
    case "base": return "bg-primary/15 text-primary";
    case "field": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "when": return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "randomSlot": return "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400";
    case "budget": return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
  }
}

/** Returns a short preview string for a collapsed fragment. */
export function fragmentPreview(fragment: PromptFragment, type: PromptFragmentType): string {
  switch (type) {
    case "base":
      return fragment.content ?? "";
    case "field":
      return fragment.source ? `← ${fragment.source}` : "";
    case "when":
      return fragment.condition ? `if ${fragment.condition}` : "";
    case "randomSlot": {
      const n = Array.isArray(fragment.candidates) ? fragment.candidates.length : 0;
      return n > 0 ? `${n} candidates` : "";
    }
    case "budget": {
      const max = typeof fragment.maxTokens === "number" ? fragment.maxTokens : "?";
      return `≤${max} tokens`;
    }
  }
}
