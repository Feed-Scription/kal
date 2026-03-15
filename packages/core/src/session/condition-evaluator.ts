/**
 * Compatibility adapter — delegates to expression/predicate.
 * Preserves the existing ParsedCondition shape and public API.
 * @deprecated Use expression/predicate directly for new code.
 */

import type { StateValue } from '../types/types';
import {
  parseAtom,
  evaluateCondition as evalCond,
  readerFromStateRecord,
} from '../expression';

export interface ParsedCondition {
  stateKey: string;
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=';
  literal: string | number | boolean | null;
}

/** @deprecated Use expression/predicate parseAtom */
export function parseCondition(expr: string): ParsedCondition {
  const atom = parseAtom(expr);
  // Reconstruct the old stateKey format: strip "state." prefix, re-append .length
  let stateKey = atom.path.startsWith('state.')
    ? atom.path.slice('state.'.length)
    : atom.path;
  if (atom.accessor) {
    stateKey += `.${atom.accessor}`;
  }
  return { stateKey, operator: atom.operator, literal: atom.literal };
}

/** @deprecated Use expression/predicate evaluateCondition */
export function evaluateCondition(
  expr: string,
  state: Record<string, StateValue>,
): boolean {
  return evalCond(expr, readerFromStateRecord(state), { mode: 'strict' });
}
