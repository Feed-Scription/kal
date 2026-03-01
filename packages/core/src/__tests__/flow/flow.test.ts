import { describe, it, expect } from 'vitest';
import { FlowGraph } from '../../flow/flow-graph';
import { Scheduler } from '../../flow/scheduler';
import { FlowLoader } from '../../flow/flow-loader';
import type { FlowDefinition } from '../../types/types';

describe('FlowGraph', () => {
  it('应该构建简单的 DAG', () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'n1', type: 'SignalIn', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'SignalOut', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      ],
    };

    const graph = new FlowGraph(flow);
    expect(graph.getAllNodes()).toHaveLength(2);
    expect(graph.getDownstream('n1')).toEqual(['n2']);
    expect(graph.getUpstream('n2')).toEqual(['n1']);
  });

  it('应该检测环', () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'n1', type: 'Test', inputs: [{ name: 'in', type: 'string' }], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'Test', inputs: [{ name: 'in', type: 'string' }], outputs: [{ name: 'out', type: 'string' }] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
        { source: 'n2', sourceHandle: 'out', target: 'n1', targetHandle: 'in' },
      ],
    };

    expect(() => new FlowGraph(flow)).toThrow('Cycle detected');
  });

  it('应该进行拓扑排序', () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'string' }], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n3', type: 'C', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
        { source: 'n2', sourceHandle: 'out', target: 'n3', targetHandle: 'in' },
      ],
    };

    const graph = new FlowGraph(flow);
    const sorted = graph.topologicalSort();
    expect(sorted).toEqual(['n1', 'n2', 'n3']);
  });

  it('应该识别入口和出口节点', () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'n1', type: 'SignalIn', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'Middle', inputs: [{ name: 'in', type: 'string' }], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n3', type: 'SignalOut', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
        { source: 'n2', sourceHandle: 'out', target: 'n3', targetHandle: 'in' },
      ],
    };

    const graph = new FlowGraph(flow);
    expect(graph.getEntryNodes().map(n => n.id)).toEqual(['n1']);
    expect(graph.getExitNodes().map(n => n.id)).toEqual(['n3']);
  });
});

describe('Scheduler', () => {
  it('应该识别就绪节点', () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      ],
    };

    const graph = new FlowGraph(flow);
    const scheduler = new Scheduler(graph);

    const ready1 = scheduler.getReadyNodes();
    expect(ready1).toEqual(['n1']);

    scheduler.markRunning('n1');
    scheduler.markCompleted('n1');

    const ready2 = scheduler.getReadyNodes();
    expect(ready2).toEqual(['n2']);
  });

  it('应该隔离失败分支', () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      ],
    };

    const graph = new FlowGraph(flow);
    const scheduler = new Scheduler(graph);

    scheduler.markRunning('n1');
    scheduler.markFailed('n1');

    const ready = scheduler.getReadyNodes();
    expect(ready).toEqual([]); // n2 should be skipped
    expect(scheduler.getFailed().has('n2')).toBe(true);
  });

  it('应该限制并发数', () => {
    const flow: FlowDefinition = {
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [] },
        { id: 'n2', type: 'B', inputs: [], outputs: [] },
        { id: 'n3', type: 'C', inputs: [], outputs: [] },
      ],
      edges: [],
    };

    const graph = new FlowGraph(flow);
    const scheduler = new Scheduler(graph, 2);

    const ready = scheduler.getReadyNodes();
    expect(ready).toHaveLength(2); // Limited to 2
  });
});

describe('FlowLoader', () => {
  it('应该解析有效的 Flow JSON', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'SignalIn', inputs: [], outputs: [] },
      ],
      edges: [],
    });

    const flow = FlowLoader.parse(json);
    expect(flow.nodes).toHaveLength(1);
  });

  it('应该在 JSON 无效时抛出错误', () => {
    expect(() => FlowLoader.parse('invalid json')).toThrow('Invalid JSON');
  });

  it('应该验证必需字段', () => {
    expect(() => FlowLoader.parse('{}')).toThrow('must have a "nodes" array');
  });

  it('应该检测重复的节点 ID', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [] },
        { id: 'n1', type: 'B', inputs: [], outputs: [] },
      ],
      edges: [],
    });

    expect(() => FlowLoader.parse(json)).toThrow('Duplicate node id');
  });

  it('应该检测循环引用', () => {
    const loader = new FlowLoader();
    const resolver = (id: string) => {
      if (id === 'flow-a') {
        return JSON.stringify({
          nodes: [{ id: 'n1', type: 'SubFlow', inputs: [], outputs: [], config: { ref: 'flow-b' } }],
          edges: [],
        });
      }
      if (id === 'flow-b') {
        return JSON.stringify({
          nodes: [{ id: 'n2', type: 'SubFlow', inputs: [], outputs: [], config: { ref: 'flow-a' } }],
          edges: [],
        });
      }
      return '{}';
    };

    expect(() => loader.load('flow-a', resolver)).toThrow('Circular flow reference');
  });

  it('应该检测不存在的 sourceHandle', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'nonexistent', target: 'n2', targetHandle: 'in' },
      ],
    });

    expect(() => FlowLoader.parse(json)).toThrow('non-existent output handle "nonexistent"');
  });

  it('应该检测不存在的 targetHandle', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'nonexistent' },
      ],
    });

    expect(() => FlowLoader.parse(json)).toThrow('non-existent input handle "nonexistent"');
  });

  it('应该检测类型不兼容的连接', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'number' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      ],
    });

    expect(() => FlowLoader.parse(json)).toThrow('Type mismatch');
  });

  it('应该允许兼容的类型连接', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'object' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      ],
    });

    expect(() => FlowLoader.parse(json)).not.toThrow();
  });

  it('应该检测重复的 Handle 名称', () => {
    const json = JSON.stringify({
      nodes: [
        {
          id: 'n1',
          type: 'A',
          inputs: [
            { name: 'in', type: 'string' },
            { name: 'in', type: 'number' }
          ],
          outputs: []
        },
      ],
      edges: [],
    });

    expect(() => FlowLoader.parse(json)).toThrow('duplicate input handle');
  });
});
