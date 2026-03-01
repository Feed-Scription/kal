/**
 * Signal nodes: SignalIn, SignalOut, Timer
 */

import type { CustomNode } from '../../types/node';

export const SignalIn: CustomNode = {
  type: 'SignalIn',
  label: '信号输入',
  inputs: [],
  outputs: [
    { name: 'data', type: 'object' },
  ],
  async execute(inputs) {
    return { data: inputs };
  },
};

export const SignalOut: CustomNode = {
  type: 'SignalOut',
  label: '信号输出',
  inputs: [
    { name: 'data', type: 'object' },
  ],
  outputs: [
    { name: 'data', type: 'object' },
  ],
  async execute(inputs) {
    return { data: inputs.data };
  },
};

export const Timer: CustomNode = {
  type: 'Timer',
  label: '计时器',
  inputs: [],
  outputs: [
    { name: 'timestamp', type: 'number' },
  ],
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
