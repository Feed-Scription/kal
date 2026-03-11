/**
 * 共享测试工具函数
 */
import { vi } from 'vitest';
import type { NodeContext } from '../../types/node';

/**
 * 创建 mock NodeContext
 */
export function createMockContext(): NodeContext {
  const stateMap = new Map<string, any>();
  return {
    state: {
      get: (key: string) => stateMap.get(key),
      set: (key: string, value: any) => { stateMap.set(key, value); },
      delete: (key: string) => { stateMap.delete(key); },
      append: (key: string, value: any) => {
        const current = stateMap.get(key);
        if (!current) {
          stateMap.set(key, { type: 'array', value: [value] });
          return;
        }
        stateMap.set(key, { ...current, value: [...current.value, value] });
      },
      appendMany: (key: string, values: any[]) => {
        const current = stateMap.get(key);
        if (!current) {
          stateMap.set(key, { type: 'array', value: [...values] });
          return;
        }
        stateMap.set(key, { ...current, value: [...current.value, ...values] });
      },
    },
    llm: {
      invoke: vi.fn().mockResolvedValue({
        text: 'mock',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    executionId: 'exec-1',
    nodeId: 'node-1',
  };
}
