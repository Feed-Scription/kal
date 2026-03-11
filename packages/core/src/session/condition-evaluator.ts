/**
 * Safe condition evaluator for Branch steps.
 * Only supports: state.key op literal
 * Operators: ==, !=, >, >=, <, <=
 * Literals: number, 'string'/"string", true/false/null
 */

import type { StateValue } from '../types/types';

export interface ParsedCondition {
  stateKey: string;
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=';
  literal: string | number | boolean | null;
}

const CONDITION_RE =
  /^state\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.length)?)\s*(==|!=|>=?|<=?)\s*(.+)$/;

const OPERATORS = new Set(['==', '!=', '>', '>=', '<', '<=']);

function parseLiteral(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  // Quoted string
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  // Number
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') {
    return num;
  }

  throw new Error(`Invalid literal in condition: ${raw}`);
}

export function parseCondition(expr: string): ParsedCondition {
  const match = CONDITION_RE.exec(expr.trim());
  if (!match) {
    throw new Error(`Invalid condition expression: "${expr}". Expected format: state.key op literal`);
  }

  const [, stateKey, operator, literalRaw] = match;
  if (!OPERATORS.has(operator!)) {
    throw new Error(`Unsupported operator: ${operator}`);
  }

  return {
    stateKey: stateKey!,
    operator: operator as ParsedCondition['operator'],
    literal: parseLiteral(literalRaw!),
  };
}

export function evaluateCondition(
  expr: string,
  state: Record<string, StateValue>,
): boolean {
  const { stateKey, operator, literal } = parseCondition(expr);

  // 支持 state.key.length 表达式
  let actualKey = stateKey;
  let useLengthAccessor = false;
  if (stateKey.endsWith('.length')) {
    actualKey = stateKey.slice(0, -'.length'.length);
    useLengthAccessor = true;
  }

  const sv = state[actualKey];
  if (!sv) return false;

  const actual = useLengthAccessor ? (Array.isArray(sv.value) ? sv.value.length : 0) : sv.value;

  switch (operator) {
    case '==':
      return actual === literal;
    case '!=':
      return actual !== literal;
    case '>':
      return (actual as number) > (literal as number);
    case '>=':
      return (actual as number) >= (literal as number);
    case '<':
      return (actual as number) < (literal as number);
    case '<=':
      return (actual as number) <= (literal as number);
    default:
      return false;
  }
}
