/**
 * Predicate — condition expression parse/eval layer.
 * Sits above reader, adds condition semantics (.length compat, strict/lenient modes).
 */

import type { ValueReader } from './reader';
import { resolvePath } from './reader';

// ── Types ──

/** Condition spec: string atom or structured composite */
export type ConditionSpec =
  | string
  | { all: ConditionSpec[] }
  | { any: ConditionSpec[] }
  | { not: ConditionSpec };

/** Parsed atom with explicit accessor marker */
export interface ParsedAtom {
  path: string;           // e.g. "state.player.health" (without .length suffix)
  accessor?: 'length';    // explicit .length accessor
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=';
  literal: string | number | boolean | null;
}

export interface EvaluateOptions {
  /** strict: parse failure throws. lenient: parse failure falls back to truthy check. */
  mode: 'strict' | 'lenient';
}

// ── Constants ──

const OPERATORS = new Set(['==', '!=', '>', '>=', '<', '<=']);

// Match: state.key.nested op literal  OR  data.key.nested op literal
const ATOM_RE =
  /^((?:state|data)\.[a-zA-Z_][a-zA-Z0-9_.]*)\s*(==|!=|>=?|<=?)\s*(.+)$/;

// ── Public API ──

export function parseLiteral(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') {
    return num;
  }

  throw new Error(`Invalid literal in condition: ${raw}`);
}

export function parseAtom(expr: string): ParsedAtom {
  const match = ATOM_RE.exec(expr.trim());
  if (!match) {
    throw new Error(`Invalid condition expression: "${expr}". Expected format: state.key op literal`);
  }

  const [, rawPath, operator, literalRaw] = match;
  if (!OPERATORS.has(operator!)) {
    throw new Error(`Unsupported operator: ${operator}`);
  }

  let path = rawPath!;
  let accessor: 'length' | undefined;
  if (path.endsWith('.length')) {
    path = path.slice(0, -'.length'.length);
    accessor = 'length';
  }

  return {
    path,
    accessor,
    operator: operator as ParsedAtom['operator'],
    literal: parseLiteral(literalRaw!),
  };
}

export function compareValues(
  actual: unknown,
  operator: string,
  literal: unknown,
): boolean {
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

/** For ComputeState: evaluate "value op literal" */
export function evaluateValueCondition(condition: string, value: unknown): boolean {
  const match = /^value\s*(==|!=|>=?|<=?)\s*(.+)$/.exec(condition.trim());
  if (!match) {
    throw new Error(`Invalid condition: ${condition}. Expected format: value op literal`);
  }
  const [, operator, literalRaw] = match;
  const literal = parseLiteral(literalRaw!);
  return compareValues(value, operator!, literal);
}

function resolveAtomValue(atom: ParsedAtom, reader: ValueReader): unknown {
  const raw = resolvePath(reader, atom.path);
  if (atom.accessor === 'length') {
    return Array.isArray(raw) ? raw.length : 0;
  }
  return raw;
}

function evaluateAtom(
  expr: string,
  reader: ValueReader,
  mode: 'strict' | 'lenient',
): boolean {
  let atom: ParsedAtom;
  try {
    atom = parseAtom(expr);
  } catch (e) {
    if (mode === 'strict') throw e;
    // lenient: fallback to truthy check
    return !!resolvePath(reader, expr);
  }

  const actual = resolveAtomValue(atom, reader);
  // state key not found → false (matches existing behavior)
  if (actual === undefined) return false;
  return compareValues(actual, atom.operator, atom.literal);
}

export function evaluateCondition(
  spec: ConditionSpec,
  reader: ValueReader,
  options: EvaluateOptions = { mode: 'strict' },
): boolean {
  if (typeof spec === 'string') {
    return evaluateAtom(spec, reader, options.mode);
  }

  if ('all' in spec) {
    return spec.all.every((child) => evaluateCondition(child, reader, options));
  }

  if ('any' in spec) {
    return spec.any.some((child) => evaluateCondition(child, reader, options));
  }

  if ('not' in spec) {
    return !evaluateCondition(spec.not, reader, options);
  }

  return false;
}

/** Validate a ConditionSpec recursively, returning errors with paths */
export function validateConditionSpec(
  spec: ConditionSpec,
  basePath: string,
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];

  if (typeof spec === 'string') {
    try {
      parseAtom(spec);
    } catch (e) {
      errors.push({ path: basePath, message: (e as Error).message });
    }
    return errors;
  }

  if (typeof spec === 'object' && spec !== null) {
    if ('all' in spec) {
      if (!Array.isArray(spec.all)) {
        errors.push({ path: basePath, message: '"all" must be an array' });
      } else {
        for (let i = 0; i < spec.all.length; i++) {
          errors.push(...validateConditionSpec(spec.all[i]!, `${basePath}.all[${i}]`));
        }
      }
      return errors;
    }

    if ('any' in spec) {
      if (!Array.isArray(spec.any)) {
        errors.push({ path: basePath, message: '"any" must be an array' });
      } else {
        for (let i = 0; i < spec.any.length; i++) {
          errors.push(...validateConditionSpec(spec.any[i]!, `${basePath}.any[${i}]`));
        }
      }
      return errors;
    }

    if ('not' in spec) {
      errors.push(...validateConditionSpec(spec.not, `${basePath}.not`));
      return errors;
    }
  }

  errors.push({ path: basePath, message: 'Invalid condition spec: must be string, {all}, {any}, or {not}' });
  return errors;
}
