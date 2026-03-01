import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutor } from '../../flow/flow-executor';
import { NodeRegistry } from '../../node/node-registry';
import { HookManager } from '../../hook-manager';
import { StateStore } from '../../state-store';
import { BUILTIN_NODES } from '../../node/builtin';
import type { FlowDefinition } from '../../types/types';
import type { NodeContext } from '../../types/node';

describe('Flow E2E - Minimal', () => {
  let registry: NodeRegistry;
  let hookManager: HookManager;
  let stateStore: StateStore;

  beforeEach(() => {
    registry = new NodeRegistry();
    for (const node of BUILTIN_NODES) {
      registry.register(node);
    }

    hookManager = new HookManager();
    stateStore = new StateStore();
  });

  it('应该执行最小链路：SignalIn → SignalOut', async () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'si', type: 'SignalIn', inputs: [], outputs: [{ name: 'message', type: 'string' }] },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'any' }], outputs: [{ name: 'data', type: 'any' }] },
      ],
      edges: [
        { source: 'si', sourceHandle: 'message', target: 'so', targetHandle: 'data' },
      ],
    };

    const contextFactory = (executionId: string, nodeId: string): NodeContext => ({
      state: {
        get: (key: string) => stateStore.get(key).value,
        set: (key: string, value: any) => { stateStore.add(key, value.type, value.value); },
        delete: (key: string) => { stateStore.remove(key); },
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
      executionId,
      nodeId,
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory });
    const result = await executor.execute(flow, 'test-flow', { message: 'hello' });

    expect(result.errors).toHaveLength(0);
    expect(result.outputs['so']?.data).toEqual('hello');
  });

  it('应该执行完整链路：SignalIn → ReadState → Message → GenerateText → SignalOut', async () => {
    stateStore.add('playerName', 'string', 'Alice');

    const flow: FlowDefinition = {
      nodes: [
        { id: 'si', type: 'SignalIn', inputs: [], outputs: [{ name: 'data', type: 'object' }] },
        { id: 'rs', type: 'ReadState', inputs: [{ name: 'key', type: 'string', defaultValue: 'playerName' }], outputs: [{ name: 'value', type: 'object' }, { name: 'exists', type: 'boolean' }] },
        { id: 'msg', type: 'Message', inputs: [{ name: 'user', type: 'string', required: true }], outputs: [{ name: 'messages', type: 'ChatMessage[]' }] },
        { id: 'gen', type: 'GenerateText', inputs: [{ name: 'messages', type: 'ChatMessage[]', required: true }], outputs: [{ name: 'text', type: 'string' }, { name: 'usage', type: 'object' }], config: { model: 'gpt-4' } },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'object' }], outputs: [{ name: 'data', type: 'object' }] },
      ],
      edges: [
        { source: 'si', sourceHandle: 'data', target: 'rs', targetHandle: 'key' },
        { source: 'rs', sourceHandle: 'value', target: 'msg', targetHandle: 'user' },
        { source: 'msg', sourceHandle: 'messages', target: 'gen', targetHandle: 'messages' },
        { source: 'gen', sourceHandle: 'text', target: 'so', targetHandle: 'data' },
      ],
    };

    const mockLLM = vi.fn().mockResolvedValue({
      text: 'Hello Alice!',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    const contextFactory = (executionId: string, nodeId: string): NodeContext => ({
      state: {
        get: (key: string) => stateStore.get(key).value,
        set: (key: string, value: any) => { stateStore.add(key, value.type, value.value); },
        delete: (key: string) => { stateStore.remove(key); },
      },
      llm: { invoke: mockLLM },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      executionId,
      nodeId,
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory });
    const result = await executor.execute(flow, 'test-flow');

    expect(result.errors).toHaveLength(0);
    expect(result.outputs['so']?.data).toBe('Hello Alice!');
    expect(mockLLM).toHaveBeenCalledOnce();
  });

  it('应该并行执行独立分支', async () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'si', type: 'SignalIn', inputs: [], outputs: [{ name: 'data', type: 'object' }] },
        { id: 'a', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }], config: { delay: 10 } },
        { id: 'b', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }], config: { delay: 10 } },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'object' }], outputs: [{ name: 'data', type: 'object' }] },
      ],
      edges: [
        { source: 'si', sourceHandle: 'data', target: 'a', targetHandle: 'data' },
        { source: 'si', sourceHandle: 'data', target: 'b', targetHandle: 'data' },
        { source: 'a', sourceHandle: 'timestamp', target: 'so', targetHandle: 'data' },
      ],
    };

    const contextFactory = (executionId: string, nodeId: string): NodeContext => ({
      state: {
        get: (key: string) => stateStore.get(key).value,
        set: (key: string, value: any) => {},
        delete: (key: string) => {},
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
      executionId,
      nodeId,
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory });
    const startTime = Date.now();
    const result = await executor.execute(flow, 'test-flow');
    const duration = Date.now() - startTime;

    expect(result.errors).toHaveLength(0);
    // Should complete in ~10ms (parallel), not ~20ms (sequential)
    expect(duration).toBeLessThan(50);
  });

  it('应该隔离错误分支', async () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'si', type: 'SignalIn', inputs: [], outputs: [{ name: 'data', type: 'object' }] },
        { id: 'fail', type: 'UnknownNode', inputs: [], outputs: [] },
        { id: 'ok', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }] },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'object' }], outputs: [{ name: 'data', type: 'object' }] },
      ],
      edges: [
        { source: 'si', sourceHandle: 'data', target: 'fail', targetHandle: 'data' },
        { source: 'si', sourceHandle: 'data', target: 'ok', targetHandle: 'data' },
        { source: 'ok', sourceHandle: 'timestamp', target: 'so', targetHandle: 'data' },
      ],
    };

    const contextFactory = (executionId: string, nodeId: string): NodeContext => ({
      state: {
        get: (key: string) => stateStore.get(key).value,
        set: (key: string, value: any) => {},
        delete: (key: string) => {},
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
      executionId,
      nodeId,
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory });
    const result = await executor.execute(flow, 'test-flow');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.nodeId).toBe('fail');
    expect(result.outputs['so']).toBeDefined(); // ok branch completed
  });

  it('应该触发 hooks', async () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'si', type: 'SignalIn', inputs: [], outputs: [{ name: 'data', type: 'object' }] },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'object' }], outputs: [{ name: 'data', type: 'object' }] },
      ],
      edges: [
        { source: 'si', sourceHandle: 'data', target: 'so', targetHandle: 'data' },
      ],
    };

    const onFlowStart = vi.fn();
    const onFlowEnd = vi.fn();
    const onNodeEnd = vi.fn();

    hookManager.on('onFlowStart', onFlowStart);
    hookManager.on('onFlowEnd', onFlowEnd);
    hookManager.on('onNodeEnd', onNodeEnd);

    const contextFactory = (executionId: string, nodeId: string): NodeContext => ({
      state: {
        get: (key: string) => stateStore.get(key).value,
        set: (key: string, value: any) => {},
        delete: (key: string) => {},
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
      executionId,
      nodeId,
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory });
    await executor.execute(flow, 'test-flow');

    expect(onFlowStart).toHaveBeenCalledOnce();
    expect(onFlowEnd).toHaveBeenCalledOnce();
    expect(onNodeEnd).toHaveBeenCalledTimes(2); // si + so
  });
});
