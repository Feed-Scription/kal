import { afterEach, describe, expect, it } from 'vitest';
import type { FlowDefinition, SessionDefinition } from '@kal-ai/core';
import { EngineRuntime } from './runtime';
import { createPassThroughFlow, createStateMutationFlow, createTempProject } from './test-helpers';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!();
  }
});

describe('EngineRuntime', () => {
  it('应该加载项目并暴露项目信息', async () => {
    const fixture = await createTempProject({
      customNodeSource: `export default {
        type: 'CustomNode',
        label: 'Custom Node',
        inputs: [],
        outputs: [],
        async execute() { return {}; }
      };`,
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const info = runtime.getProjectInfo();

    expect(info.name).toBe('test-project');
    expect(info.flows).toEqual(['main']);
    expect(info.customNodes).toEqual(['CustomNode']);
  });

  it('应该执行 flow 并返回通道输出', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const result = await runtime.executeFlow('main', { message: 'hello' });

    expect(result.errors).toHaveLength(0);
    expect(result.outputs).toEqual({ reply: 'hello' });
  });

  it('reload 应该重置运行时 state', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createPassThroughFlow(),
        mutate: createStateMutationFlow(),
      },
      initialState: {
        visited: { type: 'boolean', value: false },
      },
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    await runtime.executeFlow('mutate');
    expect(runtime.getProjectInfo().state.keys).toContain('visited');

    await runtime.reload();
    expect(runtime.getProjectInfo().state.keys).toContain('visited');
  });

  it('saveFlow 应该拒绝非法 flow', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const invalidFlow = {
      meta: {
        schemaVersion: '1.0.0',
        inputs: [{ name: 'message', type: 'string', required: true }],
        outputs: [{ name: 'reply', type: 'string' }],
      },
      data: {
        nodes: [
          {
            id: 'signal-out',
            type: 'SignalOut',
            inputs: [{ name: 'data', type: 'string' }],
            outputs: [{ name: 'data', type: 'string' }],
            config: { channel: 'reply' },
          },
        ],
        edges: [],
      },
    } as FlowDefinition;

    await expect(runtime.saveFlow('main', invalidFlow)).rejects.toThrow('message');
  });

  it('hasSession 无 session 时返回 false', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    expect(runtime.hasSession()).toBe(false);
    expect(runtime.getProjectInfo().hasSession).toBe(false);
  });

  it('hasSession 有 session 时返回 true', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'run', type: 'RunFlow', flowRef: 'main', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    expect(runtime.hasSession()).toBe(true);
    expect(runtime.getProjectInfo().hasSession).toBe(true);
  });

  it('saveSession 校验失败应该抛错', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const invalidSession: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'run', type: 'RunFlow', flowRef: 'nonexistent', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    await expect(runtime.saveSession(invalidSession)).rejects.toThrow('Invalid session definition');
  });

  it('saveSession 成功后 getSession 返回新值', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    expect(runtime.hasSession()).toBe(false);

    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'run', type: 'RunFlow', flowRef: 'main', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };
    await runtime.saveSession(session);

    expect(runtime.hasSession()).toBe(true);
    expect(runtime.getSession()).toEqual(session);
  });

  it('deleteSession 应该删除 session', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'run', type: 'RunFlow', flowRef: 'main', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    expect(runtime.hasSession()).toBe(true);

    await runtime.deleteSession();
    expect(runtime.hasSession()).toBe(false);
    expect(runtime.getSession()).toBeUndefined();
  });
});
