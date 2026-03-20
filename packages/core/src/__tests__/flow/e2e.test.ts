import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutor } from '../../flow/flow-executor';
import { NodeRegistry } from '../../node/node-registry';
import { HookManager } from '../../hook-manager';
import { StateStore } from '../../state-store';
import { BUILTIN_NODES } from '../../node/builtin';
import type { FlowDefinition } from '../../types/types';
import type { NodeContext } from '../../types/node';

function createFlow(flow: FlowDefinition['data'], meta: FlowDefinition['meta']): FlowDefinition {
  return { meta: { schemaVersion: '1.0.0', ...meta }, data: flow };
}

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

  function createContextFactory(mockLLM = vi.fn().mockResolvedValue({
    text: 'mock',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  })) {
    return (executionId: string, nodeId: string): NodeContext => ({
      state: {
        get: (key: string) => stateStore.get(key).value,
        set: (key: string, value: any) => {
          const result = stateStore.upsert(key, value.type, value.value);
          if (!result.success) throw result.error;
        },
        delete: (key: string) => {
          const result = stateStore.remove(key);
          if (!result.success) throw result.error;
        },
        append: (key: string, value: any) => {
          const result = stateStore.append(key, value);
          if (!result.success) throw result.error;
        },
        appendMany: (key: string, values: any[]) => {
          const result = stateStore.appendMany(key, values);
          if (!result.success) throw result.error;
        },
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
  }

  it('应该执行最小链路：SignalIn → SignalOut', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'si', type: 'SignalIn', inputs: [], outputs: [{ name: 'data', type: 'string' }], config: { channel: 'message' } },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'string' }], outputs: [{ name: 'data', type: 'string' }], config: { channel: 'reply' } },
      ],
      edges: [
        { source: 'si', sourceHandle: 'data', target: 'so', targetHandle: 'data' },
      ],
    }, {
      schemaVersion: '1.0.0',
      inputs: [{ name: 'message', type: 'string', required: true }],
      outputs: [{ name: 'reply', type: 'string' }],
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory: createContextFactory() });
    const result = await executor.execute(flow, 'test-flow', { message: 'hello' });

    expect(result.errors).toHaveLength(0);
    expect(result.outputs.reply).toEqual('hello');
  });

  it('应该执行对话链路并自动维护 history', async () => {
    stateStore.add('history', 'array', [{ role: 'assistant', content: 'previous' }] as any);
    const mockLLM = vi.fn().mockResolvedValue({
      text: 'Hello Alice!',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    const flow = createFlow({
      nodes: [
        { id: 'si', type: 'SignalIn', inputs: [], outputs: [{ name: 'data', type: 'string' }], config: { channel: 'user' } },
        {
          id: 'msg',
          type: 'Message',
          inputs: [
            { name: 'system', type: 'string', defaultValue: 'Be helpful' },
            { name: 'user', type: 'string', required: true },
          ],
          outputs: [{ name: 'messages', type: 'ChatMessage[]' }],
          config: { historyKey: 'history' },
        },
        {
          id: 'gen',
          type: 'GenerateText',
          inputs: [{ name: 'messages', type: 'ChatMessage[]', required: true }],
          outputs: [{ name: 'text', type: 'string' }, { name: 'usage', type: 'object' }],
          config: { model: 'gpt-4', historyKey: 'history', historyPolicy: { maxMessages: 4 } },
        },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'string' }], outputs: [{ name: 'data', type: 'string' }], config: { channel: 'reply' } },
      ],
      edges: [
        { source: 'si', sourceHandle: 'data', target: 'msg', targetHandle: 'user' },
        { source: 'msg', sourceHandle: 'messages', target: 'gen', targetHandle: 'messages' },
        { source: 'gen', sourceHandle: 'text', target: 'so', targetHandle: 'data' },
      ],
    }, {
      schemaVersion: '1.0.0',
      inputs: [{ name: 'user', type: 'string', required: true }],
      outputs: [{ name: 'reply', type: 'string' }],
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory: createContextFactory(mockLLM) });
    const result = await executor.execute(flow, 'chat-flow', { user: 'Alice' });

    expect(result.errors).toHaveLength(0);
    expect(result.outputs.reply).toBe('Hello Alice!');
    expect(mockLLM).toHaveBeenCalledOnce();
    expect(stateStore.get('history').value?.value).toEqual([
      { role: 'assistant', content: 'previous' },
      { role: 'user', content: 'Alice' },
      { role: 'assistant', content: 'Hello Alice!' },
    ]);
  });

  it('应该并行执行独立分支', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }], config: { delay: 10 } },
        { id: 'b', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }], config: { delay: 10 } },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'number' }], outputs: [{ name: 'data', type: 'number' }], config: { channel: 'reply' } },
      ],
      edges: [
        { source: 'a', sourceHandle: 'timestamp', target: 'so', targetHandle: 'data' },
      ],
    }, {
      schemaVersion: '1.0.0',
      outputs: [{ name: 'reply', type: 'number' }],
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory: createContextFactory() });
    const startTime = Date.now();
    const result = await executor.execute(flow, 'parallel-flow');
    const duration = Date.now() - startTime;

    expect(result.errors).toHaveLength(0);
    expect(result.outputs.reply).toBeTypeOf('number');
    expect(duration).toBeLessThan(50);
  });

  it('应该隔离错误分支', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'fail', type: 'UnknownNode', inputs: [], outputs: [] },
        { id: 'ok', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }] },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'number' }], outputs: [{ name: 'data', type: 'number' }], config: { channel: 'reply' } },
      ],
      edges: [
        { source: 'ok', sourceHandle: 'timestamp', target: 'so', targetHandle: 'data' },
      ],
    }, {
      schemaVersion: '1.0.0',
      outputs: [{ name: 'reply', type: 'number' }],
    });

    const executor = new FlowExecutor({ registry, hookManager, contextFactory: createContextFactory() });
    const result = await executor.execute(flow, 'error-flow');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.nodeId).toBe('fail');
    expect(result.outputs.reply).toBeDefined();
  });

  it('应该触发 hooks', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }] },
        { id: 'so', type: 'SignalOut', inputs: [{ name: 'data', type: 'number' }], outputs: [{ name: 'data', type: 'number' }], config: { channel: 'reply' } },
      ],
      edges: [
        { source: 'a', sourceHandle: 'timestamp', target: 'so', targetHandle: 'data' },
      ],
    }, {
      schemaVersion: '1.0.0',
      outputs: [{ name: 'reply', type: 'number' }],
    });

    const onFlowStart = vi.fn();
    const onFlowEnd = vi.fn();
    const onNodeEnd = vi.fn();
    hookManager.on('onFlowStart', onFlowStart);
    hookManager.on('onFlowEnd', onFlowEnd);
    hookManager.on('onNodeEnd', onNodeEnd);

    const executor = new FlowExecutor({ registry, hookManager, contextFactory: createContextFactory() });
    await executor.execute(flow, 'hook-flow');

    expect(onFlowStart).toHaveBeenCalledOnce();
    expect(onFlowEnd).toHaveBeenCalledOnce();
    expect(onNodeEnd).toHaveBeenCalledTimes(2);
  });

  it('应该使用全局默认 node timeout 作为 fallback', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'timer', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }], config: { delay: 20 } },
      ],
      edges: [],
    }, {
      schemaVersion: '1.0.0',
    });

    const executor = new FlowExecutor({
      registry,
      hookManager,
      contextFactory: createContextFactory(),
      defaultNodeTimeoutMs: 5,
    });
    const result = await executor.execute(flow, 'timeout-flow');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.errorType).toBe('timeout');
    expect(result.errors[0]?.message).toContain('timeout after 5ms');
  });

  it('应该在 run timeout 命中时抛出明确的总执行超时错误', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'timer', type: 'Timer', inputs: [], outputs: [{ name: 'timestamp', type: 'number' }], config: { delay: 20 } },
      ],
      edges: [],
    }, {
      schemaVersion: '1.0.0',
    });

    const executor = new FlowExecutor({
      registry,
      hookManager,
      contextFactory: createContextFactory(),
      defaultNodeTimeoutMs: 100,
    });

    await expect(executor.execute(flow, 'timeout-flow', undefined, undefined, Date.now() + 5, 5)).rejects.toThrow(
      'execution timeout after 5ms',
    );
  });
});
