/**
 * Prompt composition - resolve fragments into text or chat messages
 * Includes formatting utilities from format.ts
 */

import type { Fragment } from './fragments';
import type { ChatMessage, ChatMessageRole, StateValue } from '../types/types';
import { readerFromStore, resolvePath, interpolateTemplate } from '../expression/reader';
import { evaluateCondition } from '../expression/predicate';

export interface PromptScope {
  data?: Record<string, any>;
  state?: {
    get(key: string): StateValue | undefined;
  };
}

interface ResolvedSegment {
  text: string;
  role?: ChatMessageRole;
}

/**
 * Resolve a list of fragments into text segments
 */
export function composeSegments(fragments: Fragment[], scope: PromptScope = {}): string[] {
  return fragments.flatMap((fragment) => resolveFragment(fragment, scope).map((segment) => segment.text));
}

export function compose(fragments: Fragment[], scope: PromptScope = {}): string {
  return composeSegments(fragments, scope).join('\n\n');
}

export function composeMessages(
  fragments: Fragment[],
  scope: PromptScope = {},
  options: { defaultRole?: ChatMessageRole } = {}
): ChatMessage[] {
  const defaultRole = options.defaultRole ?? 'system';
  const messages: ChatMessage[] = [];

  for (const segment of fragments.flatMap((fragment) => resolveFragment(fragment, scope))) {
    if (!segment.text) {
      continue;
    }

    const role = segment.role ?? defaultRole;
    const previous = messages[messages.length - 1];
    if (previous && previous.role === role) {
      previous.content = `${previous.content}\n\n${segment.text}`;
      continue;
    }

    messages.push({ role, content: segment.text });
  }

  return messages;
}

/**
 * Interpolate {{state.xxx}} and {{data.xxx}} template variables in text.
 * Missing values preserve the placeholder for debugging.
 * Does NOT touch {{items}} (used by field fragments).
 */
export function interpolateVariables(text: string, scope: PromptScope): string {
  return interpolateTemplate(text, scopeToReader(scope));
}

/**
 * Resolve a single fragment into text segments
 */
function resolveFragment(
  fragment: Fragment,
  scope: PromptScope,
  inheritedRole?: ChatMessageRole
): ResolvedSegment[] {
  const effectiveRole = ('role' in fragment ? fragment.role : undefined) ?? inheritedRole;

  switch (fragment.type) {
    case 'base':
      return [{ text: interpolateVariables(fragment.content, scope), role: effectiveRole }];

    case 'field':
      return resolveField(fragment, scope, effectiveRole);

    case 'when':
      return resolveWhen(fragment, scope, effectiveRole);

    case 'randomSlot':
      return resolveRandomSlot(fragment, scope, effectiveRole);

    case 'budget':
      return resolveBudget(fragment, scope, effectiveRole);

    default:
      return [];
  }
}

/**
 * Resolve a field fragment
 */
function resolveField(
  fragment: Extract<Fragment, { type: 'field' }>,
  scope: PromptScope,
  inheritedRole?: ChatMessageRole
): ResolvedSegment[] {
  const value = getValue(fragment.source, scope);
  if (value === undefined || value === null) return [];

  let items: any[] = Array.isArray(value) ? [...value] : [value];

  if (fragment.dedup && Array.isArray(items)) {
    const seen = new Set<string>();
    items = items.filter((item) => {
      const key = fragment.dedup!.map((dedupKey) => item?.[dedupKey]).join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (fragment.sort && Array.isArray(items)) {
    items.sort((a, b) => {
      const aVal = a?.[fragment.sort!];
      const bVal = b?.[fragment.sort!];
      if (typeof aVal === 'number' && typeof bVal === 'number') return bVal - aVal;
      return 0;
    });
  }

  if (fragment.window && items.length > fragment.window) {
    items = items.slice(-fragment.window);
  }

  if (fragment.sample && items.length > fragment.sample) {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    items = shuffled.slice(0, fragment.sample);
  }

  const serialized = items
    .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    .join('\n');

  const fmt = fragment.format ?? fragment.template
    ?? ((fragment as any).label ? `${(fragment as any).label}: {{items}}` : '{{items}}');
  return [{
    text: fmt.replace('{{items}}', serialized),
    role: fragment.role ?? inheritedRole,
  }];
}

/**
 * Resolve a when fragment
 * Supports comparison operators (state.key op literal) and simple truthy checks
 */
function resolveWhen(
  fragment: Extract<Fragment, { type: 'when' }>,
  scope: PromptScope,
  inheritedRole?: ChatMessageRole
): ResolvedSegment[] {
  const nextRole = fragment.role ?? inheritedRole;
  const reader = scopeToReader(scope);
  const conditionValue = evaluateCondition(fragment.condition, reader, { mode: 'lenient' });

  if (conditionValue) {
    // Support shorthand: content string instead of fragments array
    const children = fragment.fragments
      ?? ((fragment as any).content ? [{ type: 'base' as const, id: fragment.id + '_content', content: (fragment as any).content }] : []);
    return children.flatMap((child: Fragment) => resolveFragment(child, scope, nextRole));
  }
  if (fragment.else) {
    // Support shorthand: else as string instead of Fragment[]
    if (typeof fragment.else === 'string') {
      return fragment.else ? [{ text: fragment.else, role: nextRole }] : [];
    }
    return fragment.else.flatMap((child) => resolveFragment(child, scope, nextRole));
  }
  return [];
}

/**
 * Resolve a randomSlot fragment
 */
function resolveRandomSlot(
  fragment: Extract<Fragment, { type: 'randomSlot' }>,
  scope: PromptScope,
  inheritedRole?: ChatMessageRole
): ResolvedSegment[] {
  if (fragment.candidates.length === 0) return [];

  let index: number;
  if (typeof fragment.seed === 'number') {
    index = fragment.seed % fragment.candidates.length;
  } else {
    index = Math.floor(Math.random() * fragment.candidates.length);
  }

  const selected = fragment.candidates[index]!;
  return resolveFragment(selected, scope, fragment.role ?? inheritedRole);
}

/**
 * Resolve a budget fragment
 */
function resolveBudget(
  fragment: Extract<Fragment, { type: 'budget' }>,
  scope: PromptScope,
  inheritedRole?: ChatMessageRole
): ResolvedSegment[] {
  const nextRole = fragment.role ?? inheritedRole;
  const allSegments = fragment.fragments.flatMap((child) => resolveFragment(child, scope, nextRole));

  let totalTokens = 0;
  const segmentTokens = allSegments.map((segment) => {
    const tokens = estimateTokens(segment.text);
    totalTokens += tokens;
    return tokens;
  });

  if (totalTokens <= fragment.maxTokens) {
    return allSegments;
  }

  if (fragment.strategy === 'tail') {
    const result: ResolvedSegment[] = [];
    let used = 0;
    for (let index = 0; index < allSegments.length; index++) {
      if (used + segmentTokens[index]! <= fragment.maxTokens) {
        result.push(allSegments[index]!);
        used += segmentTokens[index]!;
      } else {
        break;
      }
    }
    return result;
  }

  if (fragment.strategy === 'weighted' && fragment.weights) {
    const indexed = fragment.fragments.map((child, index) => ({
      segments: resolveFragment(child, scope, nextRole),
      weight: ('id' in child && child.id) ? (fragment.weights![child.id] ?? 1) : 1,
      index,
    }));

    indexed.sort((a, b) => b.weight - a.weight);

    const result: { segments: ResolvedSegment[]; index: number }[] = [];
    let used = 0;
    for (const item of indexed) {
      const tokens = item.segments.reduce((sum, segment) => sum + estimateTokens(segment.text), 0);
      if (used + tokens <= fragment.maxTokens) {
        result.push({ segments: item.segments, index: item.index });
        used += tokens;
      }
    }

    result.sort((a, b) => a.index - b.index);
    return result.flatMap((item) => item.segments);
  }

  return allSegments;
}

function scopeToReader(scope: PromptScope) {
  return readerFromStore(
    scope.state ?? { get: () => undefined },
    scope.data,
  );
}

function getValue(path: string, scope: PromptScope): any {
  return resolvePath(scopeToReader(scope), path);
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
