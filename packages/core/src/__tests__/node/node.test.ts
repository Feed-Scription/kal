import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeRegistry } from '../../node/node-registry';
import { executeNode, resolveInputs } from '../../node/node-executor';
import { BUILTIN_NODES } from '../../node/builtin';
import type { NodeDefinition, CustomNode, NodeContext } from '../../types/node';
import { createMockContext } from '../helpers/test-utils';

describe('NodeRegistry', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it('应该能注册和查找节点', () => {
    const node: CustomNode = {
      type: 'TestNode',
      label: '测试节点',
      category: 'test',
      inputs: [],
      outputs: [],
      configSchema: { type: 'object' },
      execute: async () => ({}),
    };
    registry.register(node);
    expect(registry.has('TestNode')).toBe(true);
    expect(registry.get('TestNode')).toBe(node);
  });

  it('导出的 Manifest 应该包含 category 和 configSchema', () => {
    const node: CustomNode = {
      type: 'TestNode',
      label: '测试',
      category: 'test',
      inputs: [{ name: 'input1', type: 'string' }],
      outputs: [{ name: 'output1', type: 'string' }],
      configSchema: { type: 'object' },
      execute: async () => ({}),
    };
    registry.register(node);
    const manifests = registry.exportManifests();
    expect(manifests[0]).toMatchObject({
      type: 'TestNode',
      category: 'test',
      configSchema: { type: 'object' },
    });
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
      inputs: [{ name: 'temp', type: 'number', defaultValue: 0.7 }],
      outputs: [],
    };
    expect(resolveInputs(nodeDef, { temp: 0.9 }).temp).toBe(0.9);
  });

  it('缺少必需输入应该抛出错误', () => {
    const nodeDef: NodeDefinition = {
      id: 'n1',
      type: 'Test',
      inputs: [{ name: 'required', type: 'string', required: true }],
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
    context = createMockContext();
  });

  it('应该执行 ReadState 节点', async () => {
    context.state.set('score', { type: 'number', value: 100 });
    const nodeDef: NodeDefinition = {
      id: 'rs1',
      type: 'ReadState',
      inputs: [{ name: 'key', type: 'string', required: true }],
      outputs: [{ name: 'value', type: 'any' }, { name: 'exists', type: 'boolean' }],
    };
    const result = await executeNode(nodeDef, { key: 'score' }, registry, context);
    expect(result.exists).toBe(true);
    expect(result.value).toBe(100);
  });

  it('应该执行 GenerateText 节点并写入 history', async () => {
    context.state.set('history', { type: 'array', value: [] });
    const nodeDef: NodeDefinition = {
      id: 'gt1',
      type: 'GenerateText',
      inputs: [{ name: 'messages', type: 'ChatMessage[]', required: true }],
      outputs: [{ name: 'text', type: 'string' }, { name: 'usage', type: 'object' }],
      config: { model: 'gpt-4' },
    };
    const result = await executeNode(
      nodeDef,
      { messages: [{ role: 'user', content: 'Hello' }] },
      registry,
      context
    );
    expect(result.text).toBe('mock');
    expect(context.state.get('history')?.value).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'mock' },
    ]);
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
