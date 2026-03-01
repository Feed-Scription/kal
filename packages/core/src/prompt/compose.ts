/**
 * Prompt composition - resolve fragments into text
 * Includes formatting utilities from format.ts
 */

import type { Fragment } from './fragments';
import type { ChatMessage } from '../types/types';

/**
 * Resolve a list of fragments into text segments
 */
export function compose(fragments: Fragment[], data: Record<string, any> = {}): string[] {
  const segments: string[] = [];

  for (const fragment of fragments) {
    const resolved = resolveFragment(fragment, data);
    if (resolved.length > 0) {
      segments.push(...resolved);
    }
  }

  return segments;
}

/**
 * Resolve a single fragment into text segments
 */
function resolveFragment(fragment: Fragment, data: Record<string, any>): string[] {
  switch (fragment.type) {
    case 'base':
      return [fragment.content];

    case 'field':
      return resolveField(fragment, data);

    case 'when':
      return resolveWhen(fragment, data);

    case 'randomSlot':
      return resolveRandomSlot(fragment, data);

    case 'budget':
      return resolveBudget(fragment, data);

    default:
      return [];
  }
}

/**
 * Resolve a field fragment
 */
function resolveField(
  fragment: Extract<Fragment, { type: 'field' }>,
  data: Record<string, any>
): string[] {
  const value = getNestedValue(data, fragment.source);
  if (value === undefined || value === null) return [];

  let items: any[] = Array.isArray(value) ? [...value] : [value];

  // Dedup
  if (fragment.dedup && Array.isArray(items)) {
    const seen = new Set<string>();
    items = items.filter((item) => {
      const key = fragment.dedup!.map((k) => item?.[k]).join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Sort
  if (fragment.sort && Array.isArray(items)) {
    items.sort((a, b) => {
      const aVal = a?.[fragment.sort!];
      const bVal = b?.[fragment.sort!];
      if (typeof aVal === 'number' && typeof bVal === 'number') return bVal - aVal;
      return 0;
    });
  }

  // Window (take last N)
  if (fragment.window && items.length > fragment.window) {
    items = items.slice(-fragment.window);
  }

  // Sample (random N)
  if (fragment.sample && items.length > fragment.sample) {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    items = shuffled.slice(0, fragment.sample);
  }

  const serialized = items
    .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    .join('\n');

  const text = fragment.template.replace('{{items}}', serialized);
  return [text];
}

/**
 * Resolve a when fragment
 */
function resolveWhen(
  fragment: Extract<Fragment, { type: 'when' }>,
  data: Record<string, any>
): string[] {
  const conditionValue = getNestedValue(data, fragment.condition);

  if (conditionValue) {
    return compose(fragment.fragments, data);
  } else if (fragment.else) {
    return compose(fragment.else, data);
  }

  return [];
}

/**
 * Resolve a randomSlot fragment
 */
function resolveRandomSlot(
  fragment: Extract<Fragment, { type: 'randomSlot' }>,
  data: Record<string, any>
): string[] {
  if (fragment.candidates.length === 0) return [];

  let index: number;
  if (typeof fragment.seed === 'number') {
    // Deterministic selection based on seed
    index = fragment.seed % fragment.candidates.length;
  } else {
    index = Math.floor(Math.random() * fragment.candidates.length);
  }

  const selected = fragment.candidates[index]!;
  return resolveFragment(selected, data);
}

/**
 * Resolve a budget fragment
 */
function resolveBudget(
  fragment: Extract<Fragment, { type: 'budget' }>,
  data: Record<string, any>
): string[] {
  const allSegments = compose(fragment.fragments, data);

  // Estimate tokens (rough: ~4 chars per token)
  let totalTokens = 0;
  const segmentTokens = allSegments.map((s) => {
    const tokens = estimateTokens(s);
    totalTokens += tokens;
    return tokens;
  });

  if (totalTokens <= fragment.maxTokens) {
    return allSegments;
  }

  // Need to trim
  if (fragment.strategy === 'tail') {
    // Remove from the end until within budget
    const result: string[] = [];
    let used = 0;
    for (let i = 0; i < allSegments.length; i++) {
      if (used + segmentTokens[i]! <= fragment.maxTokens) {
        result.push(allSegments[i]!);
        used += segmentTokens[i]!;
      } else {
        break;
      }
    }
    return result;
  }

  // Weighted strategy: keep segments with higher weights
  if (fragment.strategy === 'weighted' && fragment.weights) {
    const indexed = fragment.fragments.map((f, i) => ({
      fragment: f,
      segments: resolveFragment(f, data),
      weight: ('id' in f && f.id) ? (fragment.weights![f.id] ?? 1) : 1,
      index: i,
    }));

    // Sort by weight descending
    indexed.sort((a, b) => b.weight - a.weight);

    const result: { text: string[]; index: number }[] = [];
    let used = 0;
    for (const item of indexed) {
      const tokens = item.segments.reduce((sum, s) => sum + estimateTokens(s), 0);
      if (used + tokens <= fragment.maxTokens) {
        result.push({ text: item.segments, index: item.index });
        used += tokens;
      }
    }

    // Restore original order
    result.sort((a, b) => a.index - b.index);
    return result.flatMap((r) => r.text);
  }

  return allSegments;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Estimate token count (rough: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Format utilities (merged from format.ts) ──

export type FormatType = 'xml' | 'markdown';

function formatXml(tag: string, content: string): string {
  return `<${tag}>\n${content}\n</${tag}>`;
}

function formatMarkdown(heading: string, content: string): string {
  return `## ${heading}\n\n${content}`;
}

export function formatSection(tag: string, content: string, format: FormatType = 'xml'): string {
  if (format === 'xml') {
    return formatXml(tag, content);
  }
  return formatMarkdown(tag, content);
}

export function buildMessages(params: {
  system?: string;
  user: string;
  history?: ChatMessage[];
}): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (params.system) {
    messages.push({ role: 'system', content: params.system });
  }

  if (params.history) {
    messages.push(...params.history);
  }

  messages.push({ role: 'user', content: params.user });

  return messages;
}
