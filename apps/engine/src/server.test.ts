import { afterEach, describe, expect, it } from 'vitest';
import type { SessionDefinition } from '@kal-ai/core';
import { EngineRuntime } from './runtime';
import { startEngineServer } from './server';
import { createPassThroughFlow, createTempProject } from './test-helpers';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!();
  }
});

describe('Engine HTTP server', () => {
  it('应该暴露项目、flow、执行和节点 API', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const project = await fetch(`${server.url}/api/project`).then((response) => response.json());
    expect(project.success).toBe(true);
    expect(project.data.flows).toEqual(['main']);

    const flows = await fetch(`${server.url}/api/flows`).then((response) => response.json());
    expect(flows.data.flows[0].id).toBe('main');

    const flow = await fetch(`${server.url}/api/flows/main`).then((response) => response.json());
    expect(flow.data.flow.meta.inputs[0].name).toBe('message');

    const execution = await fetch(`${server.url}/api/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowId: 'main', input: { message: 'hello' } }),
    }).then((response) => response.json());
    expect(execution.data.outputs.reply).toBe('hello');

    const nodes = await fetch(`${server.url}/api/nodes`).then((response) => response.json());
    expect(Array.isArray(nodes.data.nodes)).toBe(true);
    expect(nodes.data.nodes.length).toBeGreaterThan(0);
  });

  it('PUT /api/flows/:id 应该校验并保存 flow', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const updated = createPassThroughFlow();
    updated.meta.description = 'updated';

    const response = await fetch(`${server.url}/api/flows/main`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).then((result) => result.json());

    expect(response.success).toBe(true);
    expect(runtime.getFlow('main').meta.description).toBe('updated');
  });

  it('GET /api/project 应该返回 hasSession 字段', async () => {
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
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const project = await fetch(`${server.url}/api/project`).then((r) => r.json());
    expect(project.data.hasSession).toBe(true);
  });

  it('GET /api/session 无 session 时返回 null', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const result = await fetch(`${server.url}/api/session`).then((r) => r.json());
    expect(result.success).toBe(true);
    expect(result.data.session).toBeNull();
  });

  it('GET /api/session 有 session 时返回 session 定义', async () => {
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
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const result = await fetch(`${server.url}/api/session`).then((r) => r.json());
    expect(result.success).toBe(true);
    expect(result.data.session.schemaVersion).toBe('1.0.0');
    expect(result.data.session.steps).toHaveLength(2);
  });

  it('PUT /api/session 应该保存合法 session', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'run', type: 'RunFlow', flowRef: 'main', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const result = await fetch(`${server.url}/api/session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    }).then((r) => r.json());

    expect(result.success).toBe(true);
    expect(result.data.savedAt).toBeDefined();
    expect(runtime.hasSession()).toBe(true);
  });

  it('PUT /api/session 应该拒绝非法 session', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const invalidSession: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'run', type: 'RunFlow', flowRef: 'nonexistent', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const resp = await fetch(`${server.url}/api/session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidSession),
    });

    expect(resp.status).toBe(400);
    const result = await resp.json();
    expect(result.success).toBe(false);
  });

  it('DELETE /api/session 应该删除 session', async () => {
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
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    expect(runtime.hasSession()).toBe(true);

    const result = await fetch(`${server.url}/api/session`, {
      method: 'DELETE',
    }).then((r) => r.json());

    expect(result.success).toBe(true);
    expect(result.data.deletedAt).toBeDefined();
    expect(runtime.hasSession()).toBe(false);
  });
});
