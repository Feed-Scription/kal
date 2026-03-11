/**
 * Signal nodes: SignalIn, SignalOut, Timer
 */

import type { CustomNode } from '../../types/node';

export const SignalIn: CustomNode = {
  type: 'SignalIn',
  label: '信号输入',
  category: 'signal',
  inputs: [],
  outputs: [
    { name: 'data', type: 'object' },
  ],
  configSchema: {
    type: 'object',
    required: ['channel'],
    properties: {
      channel: { type: 'string' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    channel: '',
  },
  async execute(inputs) {
    return { data: inputs };
  },
};

export const SignalOut: CustomNode = {
  type: 'SignalOut',
  label: '信号输出',
  category: 'signal',
  inputs: [
    { name: 'data', type: 'object' },
  ],
  outputs: [
    { name: 'data', type: 'object' },
  ],
  configSchema: {
    type: 'object',
    required: ['channel'],
    properties: {
      channel: { type: 'string' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    channel: '',
  },
  async execute(inputs) {
    return { data: inputs.data };
  },
};

export const Timer: CustomNode = {
  type: 'Timer',
  label: '计时器',
  category: 'signal',
  inputs: [],
  outputs: [
    { name: 'timestamp', type: 'number' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      delay: { type: 'number' },
      interval: { type: 'number' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    delay: 0,
  },
  async execute(_inputs, config, context) {
    const delay = config.delay ?? 0;
    const interval = config.interval;

    if (!interval) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return { timestamp: Date.now() };
    }

    context.logger.warn('Timer interval mode is not fully supported in current architecture. Executing once.');
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return { timestamp: Date.now() };
  },
};
