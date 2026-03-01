import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CustomNodeLoader } from '../../node/custom-node-loader';
import { NodeRegistry } from '../../node/node-registry';
import type { CustomNode } from '../../types/node';

describe('CustomNodeLoader', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it('应该从模块加载有效的自定义节点', async () => {
    const myNode: CustomNode = {
      type: 'MyCustomNode',
      label: '自定义节点',
      inputs: [{ name: 'input1', type: 'string', required: true }],
      outputs: [{ name: 'result', type: 'string' }],
      async execute(inputs) {
        return { result: `processed: ${inputs.input1}` };
      },
    };

    await CustomNodeLoader.loadFromModules(
      { 'node/MyCustomNode.ts': { default: myNode } },
      registry
    );

    expect(registry.has('MyCustomNode')).toBe(true);
  });

  it('应该跳过无效的模块', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await CustomNodeLoader.loadFromModules(
      { 'node/invalid.ts': { notANode: true } },
      registry
    );

    expect(registry.getAll()).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('应该支持直接导出（非 default）', async () => {
    const myNode: CustomNode = {
      type: 'DirectExport',
      label: '直接导出',
      inputs: [],
      outputs: [],
      async execute() {
        return {};
      },
    };

    await CustomNodeLoader.loadFromModules(
      { 'node/direct.ts': myNode },
      registry
    );

    expect(registry.has('DirectExport')).toBe(true);
  });

  it('应该处理重复注册错误', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const myNode: CustomNode = {
      type: 'DuplicateNode',
      label: '重复节点',
      inputs: [],
      outputs: [],
      async execute() {
        return {};
      },
    };

    registry.register(myNode);

    await CustomNodeLoader.loadFromModules(
      { 'node/dup.ts': { default: myNode } },
      registry
    );

    // Should not throw, just log error
    expect(registry.getAll().filter(n => n.type === 'DuplicateNode')).toHaveLength(1);
    consoleSpy.mockRestore();
  });
});
