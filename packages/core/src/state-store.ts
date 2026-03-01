/**
 * State Store implementation (simplified, no locks)
 */

import type {
  StateValue,
  StateValueType,
  InitialState,
  Result,
} from './types/types';

export class StateStore {
  private store: Map<string, StateValue> = new Map();

  add(key: string, type: StateValueType, value: any): Result<void> {
    if (this.store.has(key)) {
      return { success: false, error: new Error(`State key "${key}" already exists`) };
    }
    if (!this.validateType(type, value)) {
      return { success: false, error: new Error(`Value type mismatch: expected ${type}, got ${typeof value}`) };
    }
    this.store.set(key, { type, value });
    return { success: true, data: undefined };
  }

  get(key: string): { exists: boolean; value?: StateValue } {
    const value = this.store.get(key);
    if (value === undefined) return { exists: false };
    return { exists: true, value: { type: value.type, value: this.deepCopy(value.value) } };
  }

  modify(key: string, value: any): Result<void> {
    const existing = this.store.get(key);
    if (!existing) {
      return { success: false, error: new Error(`State key "${key}" does not exist`) };
    }
    if (!this.validateType(existing.type, value)) {
      return { success: false, error: new Error(`Value type mismatch: expected ${existing.type}, got ${typeof value}`) };
    }
    this.store.set(key, { type: existing.type, value });
    return { success: true, data: undefined };
  }

  upsert(key: string, type: StateValueType, value: any): Result<void> {
    const existing = this.store.get(key);
    if (existing) {
      if (!this.validateType(existing.type, value)) {
        return { success: false, error: new Error(`Value type mismatch: expected ${existing.type}, got ${typeof value}`) };
      }
      this.store.set(key, { type: existing.type, value });
    } else {
      if (!this.validateType(type, value)) {
        return { success: false, error: new Error(`Value type mismatch: expected ${type}, got ${typeof value}`) };
      }
      this.store.set(key, { type, value });
    }
    return { success: true, data: undefined };
  }

  remove(key: string): Result<void> {
    if (!this.store.has(key)) {
      return { success: false, error: new Error(`State key "${key}" does not exist`) };
    }
    this.store.delete(key);
    return { success: true, data: undefined };
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  getAll(): Record<string, StateValue> {
    const result: Record<string, StateValue> = {};
    for (const [key, value] of this.store.entries()) {
      result[key] = { type: value.type, value: this.deepCopy(value.value) };
    }
    return result;
  }

  clear(): void {
    this.store.clear();
  }

  loadInitialState(initialState: InitialState): void {
    this.store.clear();
    for (const [key, value] of Object.entries(initialState)) {
      if (!this.validateType(value.type, value.value)) {
        throw new Error(`Invalid initial state for key "${key}": expected ${value.type}, got ${typeof value.value}`);
      }
      if (!this.isJsonSerializable(value.value)) {
        throw new Error(`Invalid initial state for key "${key}": value is not JSON serializable`);
      }
      this.store.set(key, value);
    }
  }

  private isJsonSerializable(value: any): boolean {
    try { JSON.stringify(value); return true; } catch { return false; }
  }

  private deepCopy(value: any): any {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => this.deepCopy(item));
    const copy: any = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        copy[key] = this.deepCopy(value[key]);
      }
    }
    return copy;
  }

  private validateType(type: StateValueType, value: any): boolean {
    switch (type) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && Number.isFinite(value);
      case 'boolean': return typeof value === 'boolean';
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array': return Array.isArray(value);
      default: return false;
    }
  }
}
