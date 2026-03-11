import { describe, it, expect } from 'vitest';
import { FlowGraph } from '../../flow/flow-graph';
import { Scheduler } from '../../flow/scheduler';
import { FlowLoader } from '../../flow/flow-loader';
import type { FlowDefinition, HandleDefinition } from '../../types/types';

function createFlow(params: {
  inputs?: HandleDefinition[];
  outputs?: HandleDefinition[];
  nodes: FlowDefinition['data']['nodes'];
  edges: FlowDefinition['data']['edges'];
}): FlowDefinition {
  return {
    meta: {
      schemaVersion: '1.0.0',
      inputs: params.inputs ?? [],
      outputs: params.outputs ?? [],
    },
    data: {
      nodes: params.nodes,
      edges: params.edges,
    },
  };
}

describe('FlowGraph', () => {
  it('应该构建简单的 DAG', () => {
    const flow = createFlow({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      ],
    });

    const graph = new FlowGraph(flow);
    expect(graph.getAllNodes()).toHaveLength(2);
    expect(graph.getDownstream('n1')).toEqual(['n2']);
    expect(graph.getUpstream('n2')).toEqual(['n1']);
  });

  it('应该检测环', () => {
    const flow = createFlow({
      nodes: [
        { id: 'n1', type: 'Test', inputs: [{ name: 'in', type: 'string' }], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'Test', inputs: [{ name: 'in', type: 'string' }], outputs: [{ name: 'out', type: 'string' }] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
        { source: 'n2', sourceHandle: 'out', target: 'n1', targetHandle: 'in' },
      ],
    });

    expect(() => new FlowGraph(flow)).toThrow('Cycle detected');
  });

  it('应该识别入口和出口节点', () => {
    const flow = createFlow({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'string' }], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n3', type: 'C', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
        { source: 'n2', sourceHandle: 'out', target: 'n3', targetHandle: 'in' },
      ],
    });

    const graph = new FlowGraph(flow);
    expect(graph.getEntryNodes().map((node) => node.id)).toEqual(['n1']);
    expect(graph.getExitNodes().map((node) => node.id)).toEqual(['n3']);
  });
});

describe('Scheduler', () => {
  it('应该识别就绪节点', () => {
    const flow = createFlow({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [{ name: 'out', type: 'string' }] },
        { id: 'n2', type: 'B', inputs: [{ name: 'in', type: 'string' }], outputs: [] },
      ],
      edges: [
        { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      ],
    });

    const scheduler = new Scheduler(new FlowGraph(flow));
    expect(scheduler.getReadyNodes()).toEqual(['n1']);
    scheduler.markRunning('n1');
    scheduler.markCompleted('n1');
    expect(scheduler.getReadyNodes()).toEqual(['n2']);
  });

  it('应该限制并发数', () => {
    const flow = createFlow({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [] },
        { id: 'n2', type: 'B', inputs: [], outputs: [] },
        { id: 'n3', type: 'C', inputs: [], outputs: [] },
      ],
      edges: [],
    });

    const scheduler = new Scheduler(new FlowGraph(flow), 2);
    expect(scheduler.getReadyNodes()).toHaveLength(2);
  });
});

describe('FlowLoader', () => {
  it('应该解析有效的多通道 Flow JSON', () => {
    const json = JSON.stringify(createFlow({
      inputs: [{ name: 'message', type: 'string', required: true }],
      outputs: [{ name: 'reply', type: 'string' }],
      nodes: [
        {
          id: 'in',
          type: 'SignalIn',
          inputs: [],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'message' },
        },
        {
          id: 'out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'reply' },
        },
      ],
      edges: [
        { source: 'in', sourceHandle: 'data', target: 'out', targetHandle: 'data' },
      ],
    }));

    const flow = FlowLoader.parse(json);
    expect(flow.meta.inputs?.[0]?.name).toBe('message');
    expect(flow.data.nodes).toHaveLength(2);
  });

  it('应该要求 meta 和 data', () => {
    expect(() => FlowLoader.parse('{}')).toThrow('must have a "meta" object');
    expect(() => FlowLoader.parse(JSON.stringify({ meta: { schemaVersion: '1.0.0' } }))).toThrow('must have a "data" object');
  });

  it('应该检测重复的节点 ID', () => {
    const json = JSON.stringify(createFlow({
      nodes: [
        { id: 'n1', type: 'A', inputs: [], outputs: [] },
        { id: 'n1', type: 'B', inputs: [], outputs: [] },
      ],
      edges: [],
    }));

    expect(() => FlowLoader.parse(json)).toThrow('Duplicate node id');
  });

  it('应该校验 Signal 通道声明', () => {
    const json = JSON.stringify(createFlow({
      inputs: [{ name: 'message', type: 'string' }],
      outputs: [{ name: 'reply', type: 'string' }],
      nodes: [
        {
          id: 'in',
          type: 'SignalIn',
          inputs: [],
          outputs: [{ name: 'data', type: 'string' }],
        },
        {
          id: 'out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'reply' },
        },
      ],
      edges: [],
    }));

    expect(() => FlowLoader.parse(json)).toThrow('config.channel');
  });

  it('应该要求声明的输入通道有 SignalIn 节点', () => {
    const json = JSON.stringify(createFlow({
      inputs: [{ name: 'message', type: 'string' }],
      outputs: [{ name: 'reply', type: 'string' }],
      nodes: [
        {
          id: 'out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'reply' },
        },
      ],
      edges: [],
    }));

    expect(() => FlowLoader.parse(json)).toThrow('has no SignalIn node');
  });

  it('应该检测重复的 SignalOut 通道', () => {
    const json = JSON.stringify(createFlow({
      outputs: [{ name: 'reply', type: 'string' }],
      nodes: [
        {
          id: 'out1',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'reply' },
        },
        {
          id: 'out2',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'reply' },
        },
      ],
      edges: [],
    }));

    expect(() => FlowLoader.parse(json)).toThrow('Duplicate SignalOut channel');
  });

  it('应该检测循环引用并校验 SubFlow 接口', () => {
    const loader = new FlowLoader();
    const resolver = (id: string) => {
      if (id === 'flow-a') {
        return JSON.stringify(createFlow({
          nodes: [
            {
              id: 'sub',
              type: 'SubFlow',
              ref: 'flow-b',
              inputs: [],
              outputs: [],
            },
          ],
          edges: [],
        }));
      }
      if (id === 'flow-b') {
        return JSON.stringify(createFlow({
          nodes: [
            {
              id: 'sub',
              type: 'SubFlow',
              ref: 'flow-a',
              inputs: [],
              outputs: [],
            },
          ],
          edges: [],
        }));
      }
      return '{}';
    };

    expect(() => loader.load('flow-a', resolver)).toThrow('Circular flow reference');
  });

  it('应该检测 SubFlow 接口不匹配', () => {
    const loader = new FlowLoader();
    const resolver = (id: string) => {
      if (id === 'parent') {
        return JSON.stringify(createFlow({
          nodes: [
            {
              id: 'sub',
              type: 'SubFlow',
              ref: 'child',
              inputs: [{ name: 'question', type: 'string' }],
              outputs: [{ name: 'answer', type: 'string' }],
            },
          ],
          edges: [],
        }));
      }
      return JSON.stringify(createFlow({
        inputs: [{ name: 'question', type: 'string' }],
        outputs: [{ name: 'result', type: 'string' }],
        nodes: [
          {
            id: 'in',
            type: 'SignalIn',
            inputs: [],
            outputs: [{ name: 'data', type: 'string' }],
            config: { channel: 'question' },
          },
          {
            id: 'out',
            type: 'SignalOut',
            inputs: [{ name: 'data', type: 'string' }],
            outputs: [{ name: 'data', type: 'string' }],
            config: { channel: 'result' },
          },
        ],
        edges: [],
      }));
    };

    expect(() => loader.load('parent', resolver)).toThrow('must match sub-flow');
  });
});
