import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
      execute: async (inputs) => ({ result: `processed: ${inputs.input1}` }),
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
      execute: async () => ({}),
    };

    await CustomNodeLoader.loadFromModules(
      { 'node/direct.ts': myNode },
      registry
    );

    expect(registry.has('DirectExport')).toBe(true);
  });

  it('应该从项目目录扫描并加载 ts 节点', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kal-core-loader-'));
    try {
      const nodeDir = join(root, 'node', 'nested');
      await mkdir(nodeDir, { recursive: true });
      await writeFile(
        join(nodeDir, 'ScannedNode.ts'),
        `export default {
          type: 'ScannedNode',
          label: 'Scanned Node',
          category: 'custom',
          inputs: [],
          outputs: [],
          async execute() { return {}; }
        };`
      );

      await CustomNodeLoader.loadFromProject(root, registry);
      expect(registry.has('ScannedNode')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
