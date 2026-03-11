/**
 * State nodes: AddState, RemoveState, ReadState, ModifyState
 */

import type { CustomNode } from '../../types/node';

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
    { name: 'key', type: 'string', required: true },
  ],
  outputs: [
    { name: 'value', type: 'any' },
    { name: 'exists', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    additionalProperties: false,
  },
  defaultConfig: {},
  async execute(inputs, _config, context) {
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
    },
    additionalProperties: false,
  },
  defaultConfig: {
    path: '',
    allowedKeys: [],
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
        context.state.set(key, { type: existing.type, value: newValue as any });
        applied.push(key);
      } catch (error) {
        context.logger.error('ApplyState: failed to set key', { key, error: (error as Error).message });
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
