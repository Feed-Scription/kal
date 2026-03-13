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
  private constraints: Map<string, { min?: number; max?: number; enum?: string[] }> = new Map();

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
    const constrainedValue = this.applyConstraints(key, existing.type, value);
    this.store.set(key, { ...existing, value: constrainedValue });
    return { success: true, data: undefined };
  }

  upsert(key: string, type: StateValueType, value: any): Result<void> {
    const existing = this.store.get(key);
    if (existing) {
      if (!this.validateType(existing.type, value)) {
        return { success: false, error: new Error(`Value type mismatch: expected ${existing.type}, got ${typeof value}`) };
      }
      const constrainedValue = this.applyConstraints(key, existing.type, value);
      this.store.set(key, { ...existing, value: constrainedValue });
    } else {
      if (!this.validateType(type, value)) {
        return { success: false, error: new Error(`Value type mismatch: expected ${type}, got ${typeof value}`) };
      }
      const constrainedValue = this.applyConstraints(key, type, value);
      this.store.set(key, { type, value: constrainedValue });
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

  append(key: string, value: any): Result<void> {
    return this.appendMany(key, [value]);
  }

  appendMany(key: string, values: any[]): Result<void> {
    const existing = this.store.get(key);
    if (!existing) {
      return { success: false, error: new Error(`State key "${key}" does not exist`) };
    }
    if (existing.type !== 'array') {
      return { success: false, error: new Error(`State key "${key}" is not an array`) };
    }
    if (!this.isJsonSerializable(values)) {
      return { success: false, error: new Error(`Appended values for key "${key}" are not JSON serializable`) };
    }

    const nextValue = [...(existing.value as any[]), ...this.deepCopy(values)];
    this.store.set(key, { type: 'array', value: nextValue });
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
    this.constraints.clear();
    for (const [key, value] of Object.entries(initialState)) {
      if (!this.validateType(value.type, value.value)) {
        throw new Error(`Invalid initial state for key "${key}": expected ${value.type}, got ${typeof value.value}`);
      }
      if (!this.isJsonSerializable(value.value)) {
        throw new Error(`Invalid initial state for key "${key}": value is not JSON serializable`);
      }

      // Store constraints if present
      if (value.min !== undefined || value.max !== undefined || value.enum !== undefined) {
        this.constraints.set(key, {
          min: value.min,
          max: value.max,
          enum: value.enum,
        });
      }

      this.store.set(key, {
        type: value.type,
        value: this.deepCopy(value.value),
        min: value.min,
        max: value.max,
        enum: value.enum,
      });
    }
  }

  restore(snapshot: InitialState): void {
    this.loadInitialState(snapshot);
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

  private applyConstraints(key: string, type: StateValueType, value: any): any {
    const constraint = this.constraints.get(key);
    if (!constraint) {
      return value;
    }

    // Apply number constraints (min/max)
    if (type === 'number' && typeof value === 'number') {
      let result = value;
      if (constraint.min !== undefined && result < constraint.min) {
        result = constraint.min;
      }
      if (constraint.max !== undefined && result > constraint.max) {
        result = constraint.max;
      }
      return result;
    }

    // Apply string enum constraints
    if (type === 'string' && typeof value === 'string' && constraint.enum) {
      if (!constraint.enum.includes(value)) {
        // Return first enum value as fallback
        return constraint.enum[0] ?? value;
      }
    }

    return value;
  }
}
