/**
 * Reader — pure value access layer.
 * Unifies state (Record<string, StateValue>) and data (Record<string, any>) access.
 * No condition semantics, no .length special-casing.
 */

import type { StateValue } from '../types/types';

/**
 * Unified value access interface.
 * Abstracts over Record<string, StateValue> (session layer) and StateStore (compose layer).
 */
export interface ValueReader {
  getRoot(source: 'state' | 'data', key: string): unknown;
}

/** Create a reader from Record<string, StateValue> */
export function readerFromStateRecord(
  state: Record<string, StateValue>,
  data?: Record<string, any>,
): ValueReader {
  return {
    getRoot(source, key) {
      if (source === 'state') {
        const sv = state[key];
        return sv?.value;
      }
      return data?.[key];
    },
  };
}

/** Create a reader from a StateStore-like object + data */
export function readerFromStore(
  store: { get(key: string): StateValue | undefined },
  data?: Record<string, any>,
): ValueReader {
  return {
    getRoot(source, key) {
      if (source === 'state') {
        return store.get(key)?.value;
      }
      return data?.[key];
    },
  };
}

/**
 * Resolve a dot-path to a value.
 * Supports: "state.player.name", "data.context.era", "someDataKey"
 * Does NOT special-case .length — JS native property access applies naturally.
 */
export function resolvePath(reader: ValueReader, path: string): unknown {
  if (path.startsWith('state.')) {
    const rest = path.slice('state.'.length);
    const dotIdx = rest.indexOf('.');
    if (dotIdx === -1) {
      return reader.getRoot('state', rest);
    }
    const rootKey = rest.slice(0, dotIdx);
    const nested = rest.slice(dotIdx + 1);
    return getNestedValue(reader.getRoot('state', rootKey), nested);
  }

  if (path.startsWith('data.')) {
    const rest = path.slice('data.'.length);
    const dotIdx = rest.indexOf('.');
    if (dotIdx === -1) {
      return reader.getRoot('data', rest);
    }
    const rootKey = rest.slice(0, dotIdx);
    const nested = rest.slice(dotIdx + 1);
    return getNestedValue(reader.getRoot('data', rootKey), nested);
  }

  // Bare path — treat as data
  return getNestedValue(reader.getRoot('data', path.split('.')[0]!), path.includes('.') ? path.slice(path.indexOf('.') + 1) : undefined);
}

function getNestedValue(obj: unknown, path: string | undefined): unknown {
  if (path === undefined) return obj;
  if (obj === null || obj === undefined) return undefined;
  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Interpolate {{state.xxx}} and {{data.xxx}} template variables in text.
 * Missing values preserve the placeholder for debugging.
 * Does NOT touch {{items}} (used by field fragments).
 */
export function interpolateTemplate(text: string, reader: ValueReader): string {
  return text.replace(
    /\{\{((?:state|data)\.[a-zA-Z0-9_.]+)\}\}/g,
    (match, path: string) => {
      const value = resolvePath(reader, path);
      if (value === undefined || value === null) return match;
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return JSON.stringify(value);
    },
  );
}
