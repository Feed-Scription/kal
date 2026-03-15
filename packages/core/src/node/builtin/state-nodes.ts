/**
 * State nodes: AddState, RemoveState, ReadState, ModifyState
 */

import type { CustomNode } from '../../types/node';

function clampNumber(value: number, constraints?: { min?: number; max?: number }): number {
  if (!constraints) return value;
  let result = value;
  if (constraints.min !== undefined && result < constraints.min) result = constraints.min;
  if (constraints.max !== undefined && result > constraints.max) result = constraints.max;
  return result;
}

function coerceToNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const AddState: CustomNode = {
  type: 'AddState',
  label: '添加状态',
  category: 'state',
  inputs: [
    { name: 'key', type: 'string', required: true },
    { name: 'type', type: 'string', required: true },
    { name: 'value', type: 'any', required: true },
  ],
  outputs: [
    { name: 'success', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    additionalProperties: false,
  },
  defaultConfig: {},
  async execute(inputs, _config, context) {
    try {
      context.state.set(inputs.key, { type: inputs.type, value: inputs.value });
      return { success: true };
    } catch (error) {
      context.logger.error('AddState failed', { key: inputs.key, error: (error as Error).message });
      return { success: false };
    }
  },
};

export const RemoveState: CustomNode = {
  type: 'RemoveState',
  label: '删除状态',
  category: 'state',
  inputs: [
    { name: 'key', type: 'string', required: true },
  ],
  outputs: [
    { name: 'success', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    additionalProperties: false,
  },
  defaultConfig: {},
  async execute(inputs, _config, context) {
    const exists = context.state.get(inputs.key) !== undefined;
    if (!exists) {
      return { success: false };
    }
    try {
      context.state.delete(inputs.key);
      return { success: true };
    } catch (error) {
      context.logger.error('RemoveState failed', { key: inputs.key, error: (error as Error).message });
      return { success: false };
    }
  },
};

export const ReadState: CustomNode = {
  type: 'ReadState',
  label: '读取状态',
  category: 'state',
  inputs: [
    { name: 'key', type: 'string' },
  ],
  outputs: [
    { name: 'value', type: 'any' },
    { name: 'exists', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      keys: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: true,
  },
  defaultConfig: {},
  async execute(inputs, config, context) {
    const keys = config.keys as string[] | undefined;

    // 批量模式：config.keys 指定多个 key
    if (Array.isArray(keys) && keys.length > 0) {
      const result: Record<string, any> = {};
      const all: Record<string, any> = {};
      for (const k of keys) {
        const sv = context.state.get(k);
        result[k] = sv?.value ?? undefined;
        all[k] = sv?.value ?? undefined;
      }
      result.all = all;
      return result;
    }

    // 单 key 模式
    const stateValue = context.state.get(inputs.key);
    if (stateValue === undefined) {
      return { value: undefined, exists: false };
    }
    return { value: stateValue.value, exists: true };
  },
};

export const ApplyState: CustomNode = {
  type: 'ApplyState',
  label: '批量应用状态',
  category: 'state',
  inputs: [
    { name: 'changes', type: 'object', required: true },
  ],
  outputs: [
    { name: 'applied', type: 'array' },
    { name: 'success', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      allowedKeys: { type: 'array', items: { type: 'string' } },
      operations: {
        type: 'object',
        description: 'Operation type for each key: "set" (default), "append", "appendMany", or "increment"',
      },
      deduplicateBy: {
        type: 'object',
        description: 'For appendMany keys, deduplicate by a field name. e.g. { "topicCards": "id" }',
      },
      constraints: {
        type: 'object',
        description: 'Constraints for each key: { min, max } for numbers',
      },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    path: '',
    allowedKeys: [],
    operations: {},
    constraints: {},
    deduplicateBy: {},
  },
  async execute(inputs, config, context) {
    let changes = inputs.changes;

    // Allow flows to wire named inputs directly into ApplyState without first packing an object.
    if (changes === undefined) {
      const namedEntries = Object.entries(inputs).filter(([key]) => key !== 'changes');
      if (namedEntries.length > 0) {
        changes = Object.fromEntries(namedEntries);
      }
    }

    if (!changes || typeof changes !== 'object') {
      context.logger.warn('ApplyState: changes input is not an object');
      return { applied: [], success: false };
    }

    // Extract sub-object by path if configured
    if (config.path) {
      const parts = (config.path as string).split('.');
      for (const part of parts) {
        if (changes && typeof changes === 'object' && part in changes) {
          changes = changes[part];
        } else {
          context.logger.warn('ApplyState: path not found in changes', { path: config.path });
          return { applied: [], success: false };
        }
      }
    }

    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      context.logger.warn('ApplyState: resolved changes is not a plain object');
      return { applied: [], success: false };
    }

    const allowedKeys =
      Array.isArray(config.allowedKeys) && config.allowedKeys.length > 0
        ? (config.allowedKeys as string[])
        : undefined;
    const operations = (config.operations as Record<string, string> | undefined) ?? {};
    const constraints = (config.constraints as Record<string, { min?: number; max?: number }> | undefined) ?? {};
    const deduplicateBy = (config.deduplicateBy as Record<string, string> | undefined) ?? {};
    const applied: string[] = [];

    for (const [key, newValue] of Object.entries(changes)) {
      // Filter by allowedKeys whitelist
      if (allowedKeys && !allowedKeys.includes(key)) {
        context.logger.debug('ApplyState: key not in allowedKeys, skipping', { key });
        continue;
      }

      // Only modify existing state keys
      const existing = context.state.get(key);
      if (existing === undefined) {
        context.logger.debug('ApplyState: key does not exist in state, skipping', { key });
        continue;
      }

      try {
        const operation = operations[key] ?? 'set';
        let valueToWrite = newValue;

        // Type coercion: attempt to convert mismatched types before writing
        if (valueToWrite !== null && valueToWrite !== undefined) {
          const actualType = typeof valueToWrite;
          if (existing.type === 'number' && actualType === 'string') {
            const parsed = Number(valueToWrite);
            if (Number.isFinite(parsed)) {
              context.logger.warn('ApplyState: coerced string to number', { key, original: valueToWrite, coerced: parsed });
              valueToWrite = parsed;
            }
          } else if (existing.type === 'string' && actualType === 'number') {
            context.logger.warn('ApplyState: coerced number to string', { key, original: valueToWrite, coerced: String(valueToWrite) });
            valueToWrite = String(valueToWrite);
          } else if (existing.type === 'boolean' && actualType === 'string') {
            if ((valueToWrite as string).toLowerCase() === 'true') {
              context.logger.warn('ApplyState: coerced string to boolean', { key, original: valueToWrite, coerced: true });
              valueToWrite = true;
            } else if ((valueToWrite as string).toLowerCase() === 'false') {
              context.logger.warn('ApplyState: coerced string to boolean', { key, original: valueToWrite, coerced: false });
              valueToWrite = false;
            }
          } else if (existing.type === 'array' && actualType === 'string') {
            try {
              const parsed = JSON.parse(valueToWrite as string);
              if (Array.isArray(parsed)) {
                context.logger.warn('ApplyState: coerced string to array', { key });
                valueToWrite = parsed;
              }
            } catch {
              // not valid JSON array, leave as-is
            }
          }
        }

        // Apply constraints (clamping) for number types
        if (existing.type === 'number' && typeof valueToWrite === 'number' && constraints[key]) {
          const constraint = constraints[key]!;
          const originalValue = valueToWrite;
          if (constraint.min !== undefined && valueToWrite < constraint.min) {
            valueToWrite = constraint.min;
            context.logger.warn('ApplyState: clamped value to min', { key, original: originalValue, clamped: valueToWrite, min: constraint.min });
          }
          if (constraint.max !== undefined && (valueToWrite as number) > constraint.max) {
            valueToWrite = constraint.max;
            context.logger.warn('ApplyState: clamped value to max', { key, original: originalValue, clamped: valueToWrite, max: constraint.max });
          }
        }

        // Execute operation
        if (operation === 'append') {
          context.state.append(key, valueToWrite);
          applied.push(key);
        } else if (operation === 'appendMany') {
          if (Array.isArray(valueToWrite)) {
            let items = valueToWrite;
            const dedupField = deduplicateBy[key];
            if (dedupField) {
              const currentArr = existing.value as any[] ?? [];
              const existingKeys = new Set(
                currentArr
                  .filter((item: any) => item && typeof item === 'object' && item[dedupField])
                  .map((item: any) => item[dedupField])
              );
              items = items.filter((item: any) => {
                if (item && typeof item === 'object' && item[dedupField]) {
                  if (existingKeys.has(item[dedupField])) return false;
                  existingKeys.add(item[dedupField]);
                  return true;
                }
                return true;
              });
            }
            context.state.appendMany(key, items);
            applied.push(key);
          } else {
            context.logger.error('ApplyState: appendMany requires array value', { key });
          }
        } else if (operation === 'increment') {
          if (existing.type !== 'number') {
            context.logger.error('ApplyState: increment requires number state key', { key, type: existing.type });
            continue;
          }
          const delta = coerceToNumber(valueToWrite);
          if (delta === null) {
            context.logger.error('ApplyState: increment value is not a number', { key, value: valueToWrite });
            continue;
          }
          const newValue = clampNumber(
            (existing.value as number) + delta,
            constraints[key],
          );
          context.state.set(key, { type: 'number', value: newValue });
          applied.push(key);
        } else {
          // Default: set
          context.state.set(key, { type: existing.type, value: valueToWrite as any });
          applied.push(key);
        }
      } catch (error) {
        context.logger.error('ApplyState: failed to apply operation', { key, error: (error as Error).message });
      }
    }

    return { applied, success: true };
  },
};

export const ModifyState: CustomNode = {
  type: 'ModifyState',
  label: '修改状态',
  category: 'state',
  inputs: [
    { name: 'key', type: 'string', required: true },
    { name: 'value', type: 'any', required: true },
  ],
  outputs: [
    { name: 'success', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    additionalProperties: false,
  },
  defaultConfig: {},
  async execute(inputs, _config, context) {
    const existing = context.state.get(inputs.key);
    if (existing === undefined) {
      context.logger.warn('ModifyState failed: key does not exist', { key: inputs.key });
      return { success: false };
    }
    try {
      context.state.set(inputs.key, { type: existing.type, value: inputs.value });
      return { success: true };
    } catch (error) {
      context.logger.error('ModifyState failed', { key: inputs.key, error: (error as Error).message });
      return { success: false };
    }
  },
};
