import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeRegistry } from '../../node/node-registry';
import { executeNode, resolveInputs } from '../../node/node-executor';
import { BUILTIN_NODES } from '../../node/builtin';
import type { NodeDefinition, CustomNode, NodeContext } from '../../types/node';

describe('NodeRegistry', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it('应该能注册和查找节点', () => {
    const node: CustomNode = {
      type: 'TestNode',
      label: '测试节点',
      inputs: [],
      outputs: [],
      execute: async () => ({}),
    };
    registry.register(node);
    expect(registry.has('TestNode')).toBe(true);
    expect(registry.get('TestNode')).toBe(node);
  });

  it('重复注册应该抛出错误', () => {
    const node: CustomNode = {
      type: 'TestNode',
      label: '测试',
      inputs: [],
      outputs: [],
      execute: async () => ({}),
    };
    registry.register(node);
    expect(() => registry.register(node)).toThrow('already registered');
  });

  it('应该能导出 Manifest', () => {
    const node: CustomNode = {
      type: 'TestNode',
      label: '测试',
      inputs: [{ name: 'input1', type: 'string' }],
      outputs: [{ name: 'output1', type: 'string' }],
      execute: async () => ({}),
    };
    registry.register(node);
    const manifests = registry.exportManifests();
    expect(manifests).toHaveLength(1);
    expect(manifests[0]!.type).toBe('TestNode');
    expect(manifests[0]!.inputs).toHaveLength(1);
  });

  it('应该能注册所有内置节点', () => {
    for (const node of BUILTIN_NODES) {
      registry.register(node);
    }
    expect(registry.getAll()).toHaveLength(BUILTIN_NODES.length);
  });
});

describe('resolveInputs', () => {
  it('应该使用连线值覆盖默认值', () => {
    const nodeDef: NodeDefinition = {
      id: 'n1',
      type: 'Test',
      inputs: [
        { name: 'temp', type: 'number', defaultValue: 0.7 },
      ],
      outputs: [],
    };
    const result = resolveInputs(nodeDef, { temp: 0.9 });
    expect(result.temp).toBe(0.9);
  });

  it('没有连线值时应该使用默认值', () => {
    const nodeDef: NodeDefinition = {
      id: 'n1',
      type: 'Test',
      inputs: [
        { name: 'temp', type: 'number', defaultValue: 0.7 },
      ],
      outputs: [],
    };
    const result = resolveInputs(nodeDef, {});
    expect(result.temp).toBe(0.7);
  });

  it('缺少必需输入应该抛出错误', () => {
    const nodeDef: NodeDefinition = {
      id: 'n1',
      type: 'Test',
      inputs: [
        { name: 'required', type: 'string', required: true },
      ],
      outputs: [],
    };
    expect(() => resolveInputs(nodeDef, {})).toThrow('Missing required input');
  });
});

describe('executeNode', () => {
  let registry: NodeRegistry;
  let context: NodeContext;

  beforeEach(() => {
    registry = new NodeRegistry();
    for (const node of BUILTIN_NODES) {
      registry.register(node);
    }

    const stateMap = new Map<string, any>();
    context = {
      state: {
        get: (key: string) => stateMap.get(key),
        set: (key: string, value: any) => { stateMap.set(key, value); },
        delete: (key: string) => { stateMap.delete(key); },
      },
      llm: {
        invoke: vi.fn().mockResolvedValue({
          text: 'mock response',
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
  });

  it('应该执行 SignalIn 节点', async () => {
    const nodeDef: NodeDefinition = {
      id: 'si1',
      type: 'SignalIn',
      inputs: [],
      outputs: [{ name: 'data', type: 'object' }],
    };
    const result = await executeNode(nodeDef, {}, registry, context);
    expect(result.data).toBeDefined();
  });

  it('应该执行 ReadState 节点', async () => {
    context.state.set('score', { type: 'number', value: 100 });
    const nodeDef: NodeDefinition = {
      id: 'rs1',
      type: 'ReadState',
      inputs: [{ name: 'key', type: 'string', required: true }],
      outputs: [{ name: 'value', type: 'object' }, { name: 'exists', type: 'boolean' }],
    };
    const result = await executeNode(nodeDef, { key: 'score' }, registry, context);
    expect(result.exists).toBe(true);
    expect(result.value).toBe(100);
  });

  it('应该执行 GenerateText 节点', async () => {
    const nodeDef: NodeDefinition = {
      id: 'gt1',
      type: 'GenerateText',
      inputs: [{ name: 'messages', type: 'ChatMessage[]', required: true }],
      outputs: [{ name: 'text', type: 'string' }, { name: 'usage', type: 'object' }],
      config: { model: 'gpt-4', temperature: 0.7 },
    };
    const result = await executeNode(
      nodeDef,
      { messages: [{ role: 'user', content: 'Hello' }] },
      registry,
      context
    );
    expect(result.text).toBe('mock response');
  });

  it('未知节点类型应该抛出错误', async () => {
    const nodeDef: NodeDefinition = {
      id: 'u1',
      type: 'UnknownNode',
      inputs: [],
      outputs: [],
    };
    await expect(executeNode(nodeDef, {}, registry, context)).rejects.toThrow('Unknown node type');
  });
});
