/**
 * Prompt fragment types and builders
 */

import type { ChatMessageRole } from '../types/types';

/**
 * Base fragment - static text
 */
export interface BaseFragment {
  type: 'base';
  id: string;
  content: string;
  role?: ChatMessageRole;
}

/**
 * Field fragment - dynamic content from data
 */
export interface FieldFragment {
  type: 'field';
  id: string;
  role?: ChatMessageRole;
  source: string;
  template: string;
  window?: number;
  sample?: number;
  sort?: string;
  dedup?: string[];
}

/**
 * When fragment - conditional inclusion
 */
export interface WhenFragment {
  type: 'when';
  id: string;
  role?: ChatMessageRole;
  condition: string;
  fragments: Fragment[];
  else?: Fragment[];
}

/**
 * RandomSlot fragment - random selection
 */
export interface RandomSlotFragment {
  type: 'randomSlot';
  id: string;
  role?: ChatMessageRole;
  candidates: Fragment[];
  seed?: 'random' | number;
}

/**
 * Budget fragment - token budget control
 */
export interface BudgetFragment {
  type: 'budget';
  id?: string;
  role?: ChatMessageRole;
  maxTokens: number;
  strategy: 'tail' | 'weighted';
  weights?: Record<string, number>;
  fragments: Fragment[];
}

/**
 * Union type for all fragments
 */
export type Fragment =
  | BaseFragment
  | FieldFragment
  | WhenFragment
  | RandomSlotFragment
  | BudgetFragment;

/**
 * Builder: create a base fragment
 */
export function base(id: string, content: string, role?: ChatMessageRole): BaseFragment {
  return { type: 'base', id, content, role };
}

/**
 * Builder: create a field fragment
 */
export function field(
  id: string,
  source: string,
  template: string,
  options?: { role?: ChatMessageRole; window?: number; sample?: number; sort?: string; dedup?: string[] }
): FieldFragment {
  return { type: 'field', id, source, template, ...options };
}

/**
 * Builder: create a when fragment
 */
export function when(
  id: string,
  condition: string,
  fragments: Fragment[],
  elseFragments?: Fragment[],
  options?: { role?: ChatMessageRole }
): WhenFragment {
  return { type: 'when', id, condition, fragments, else: elseFragments, ...options };
}

/**
 * Builder: create a randomSlot fragment
 */
export function randomSlot(
  id: string,
  candidates: Fragment[],
  seed?: 'random' | number,
  options?: { role?: ChatMessageRole }
): RandomSlotFragment {
  return { type: 'randomSlot', id, candidates, seed, ...options };
}

/**
 * Builder: create a budget fragment
 */
export function budget(
  maxTokens: number,
  strategy: 'tail' | 'weighted',
  fragments: Fragment[],
  weights?: Record<string, number>,
  options?: { role?: ChatMessageRole }
): BudgetFragment {
  return { type: 'budget', maxTokens, strategy, fragments, weights, ...options };
}
