import { afterEach, describe, expect, it } from 'vitest';
import type { FlowDefinition, SessionDefinition } from '@kal-ai/core';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EngineRuntime } from './runtime';
import { createPassThroughFlow, createStateMutationFlow, createTempProject } from './test-helpers';

function createDelayedFlow(delay: number, timeout?: number): FlowDefinition {
  return {
    meta: {
      schemaVersion: '1.0.0',
    },
    data: {
      nodes: [
        {
          id: 'timer',
          type: 'Timer',
          inputs: [],
          outputs: [{ name: 'timestamp', type: 'number' }],
          config: {
            delay,
            ...(timeout === undefined ? {} : { timeout }),
          },
        },
      ],
      edges: [],
    },
  };
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  delete process.env.KAL_RUNTIME_TEST_API_KEY;
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

  it('saveSession 支持 warn 模式以便先写 session 骨架', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'run', type: 'RunFlow', flowRef: 'future-flow', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const result = await runtime.saveSession(session, { flowValidationMode: 'warn' });

    expect(runtime.getSession()).toEqual(session);
    expect(result.warnings).toHaveLength(1);
  });

  it('可在需要时以宽松模式加载引用未来 flow 的 session', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'run', type: 'RunFlow', flowRef: 'future-flow', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    await expect(EngineRuntime.create(fixture.projectRoot)).rejects.toThrow('Invalid session.json');

    const runtime = await EngineRuntime.create(fixture.projectRoot, {
      sessionFlowValidationMode: 'warn',
    });

    expect(runtime.getSession()).toEqual(session);
    expect(runtime.getSessionValidationWarnings()).toHaveLength(1);
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

  it('saveConfig 应该忽略未变更的敏感 LLM 字段并保留环境变量引用', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);
    process.env.KAL_RUNTIME_TEST_API_KEY = 'env-secret-key';

    await writeFile(
      join(fixture.projectRoot, 'kal_config.json'),
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        engine: {
          logLevel: 'error',
          maxConcurrentFlows: 4,
          nodeTimeout: 1000,
          runTimeout: 0,
        },
        llm: {
          provider: 'openai',
          apiKey: '${KAL_RUNTIME_TEST_API_KEY}',
          baseUrl: 'https://example.invalid/v1',
          defaultModel: 'test-model',
          retry: {
            maxRetries: 0,
            initialDelayMs: 0,
            maxDelayMs: 0,
            backoffMultiplier: 2,
            jitter: false,
          },
          cache: {
            enabled: false,
          },
        },
      }, null, 2),
      'utf8',
    );

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const currentConfig = runtime.getConfig();

    await runtime.saveConfig({
      engine: {
        ...currentConfig.engine,
        nodeTimeout: 2000,
      },
      llm: {
        ...currentConfig.llm,
      },
    });

    const rawConfig = await readFile(join(fixture.projectRoot, 'kal_config.json'), 'utf8');
    expect(rawConfig).toContain('${KAL_RUNTIME_TEST_API_KEY}');
    expect(rawConfig).not.toContain('env-secret-key');
    expect(JSON.parse(rawConfig).engine.nodeTimeout).toBe(2000);
  });

  it('saveConfig 应该静默剥离敏感 LLM 字段而不是抛错', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const currentConfig = runtime.getConfig();

    await runtime.saveConfig({
      llm: {
        ...currentConfig.llm,
        apiKey: 'new-secret-key',
        defaultModel: 'changed-model',
      },
    });

    const rawConfig = JSON.parse(await readFile(join(fixture.projectRoot, 'kal_config.json'), 'utf8'));
    // apiKey should remain the original file value, not the new one from the patch
    expect(rawConfig.llm.apiKey).toBe('test-key');
    expect(rawConfig.llm.defaultModel).toBe('changed-model');
  });

  it('engine.nodeTimeout 会作为 node timeout 的 fallback', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createDelayedFlow(20),
      },
    });
    cleanups.push(fixture.cleanup);

    const configPath = join(fixture.projectRoot, 'kal_config.json');
    const rawConfig = JSON.parse(await readFile(configPath, 'utf8'));
    rawConfig.engine.nodeTimeout = 5;
    await writeFile(configPath, JSON.stringify(rawConfig, null, 2), 'utf8');

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const result = await runtime.executeFlow('main');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.errorType).toBe('timeout');
    expect(result.errors[0]?.message).toContain('timeout after 5ms');
  });

  it('节点级 timeout 仍然可以覆盖 engine.nodeTimeout fallback', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createDelayedFlow(20, 50),
      },
    });
    cleanups.push(fixture.cleanup);

    const configPath = join(fixture.projectRoot, 'kal_config.json');
    const rawConfig = JSON.parse(await readFile(configPath, 'utf8'));
    rawConfig.engine.nodeTimeout = 5;
    await writeFile(configPath, JSON.stringify(rawConfig, null, 2), 'utf8');

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const result = await runtime.executeFlow('main');

    expect(result.errors).toEqual([]);
  });

  it('engine.runTimeout 命中时应该抛出总执行超时错误', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createDelayedFlow(20),
      },
    });
    cleanups.push(fixture.cleanup);

    const configPath = join(fixture.projectRoot, 'kal_config.json');
    const rawConfig = JSON.parse(await readFile(configPath, 'utf8'));
    rawConfig.engine.runTimeout = 5;
    await writeFile(configPath, JSON.stringify(rawConfig, null, 2), 'utf8');

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    await expect(runtime.executeFlow('main')).rejects.toThrow('execution timeout after 5ms');
  });
});
