/**
 * State nodes: AddState, RemoveState, ReadState, ModifyState
 */

import type { CustomNode } from '../../types/node';

export const AddState: CustomNode = {
  type: 'AddState',
  label: '添加状态',
  inputs: [
    { name: 'key', type: 'string', required: true },
    { name: 'type', type: 'string', required: true },
    { name: 'value', type: 'any', required: true },
  ],
  outputs: [
    { name: 'success', type: 'boolean' },
  ],
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
  inputs: [
    { name: 'key', type: 'string', required: true },
  ],
  outputs: [
    { name: 'success', type: 'boolean' },
  ],
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
  inputs: [
    { name: 'key', type: 'string', required: true },
  ],
  outputs: [
    { name: 'value', type: 'any' },
    { name: 'exists', type: 'boolean' },
  ],
  async execute(inputs, _config, context) {
    const stateValue = context.state.get(inputs.key);
    if (stateValue === undefined) {
      return { value: undefined, exists: false };
    }
    return { value: stateValue.value, exists: true };
  },
};

export const ModifyState: CustomNode = {
  type: 'ModifyState',
  label: '修改状态',
  inputs: [
    { name: 'key', type: 'string', required: true },
    { name: 'value', type: 'any', required: true },
  ],
  outputs: [
    { name: 'success', type: 'boolean' },
  ],
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
