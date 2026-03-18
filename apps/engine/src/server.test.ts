import { afterEach, describe, expect, it } from 'vitest';
import type { SessionDefinition } from '@kal-ai/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EngineRuntime } from './runtime';
import { startEngineServer } from './server';
import { createPassThroughFlow, createStateMutationFlow, createTempProject } from './test-helpers';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!();
  }
});

async function readSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 2000,
): Promise<{ event: string; data: any }> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timed out waiting for SSE event')), timeoutMs);
      }),
    ]);

    if (chunk.done) {
      throw new Error('SSE stream closed before an event was received');
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    while (true) {
      const boundary = buffer.indexOf('\n\n');
      if (boundary < 0) {
        break;
      }

      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (!rawEvent || rawEvent.startsWith(':')) {
        continue;
      }

      const lines = rawEvent.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.slice('event:'.length).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          data += line.slice('data:'.length).trim();
        }
      }

      return {
        event,
        data: data ? JSON.parse(data) : null,
      };
    }
  }
}

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

  it('DELETE /api/flows/:id 应该删除 flow', async () => {
    const fixture = await createTempProject({
      flows: {
        intro: createPassThroughFlow(),
        main: createPassThroughFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/flows/intro`, {
      method: 'DELETE',
    }).then((result) => result.json());

    expect(response.success).toBe(true);
    expect(runtime.listFlows().map((item) => item.id)).toEqual(['main']);
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

  it('应该暴露 config 和 state 资源 API', async () => {
    const fixture = await createTempProject({
      initialState: {
        visited: { type: 'boolean', value: false },
      },
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const config = await fetch(`${server.url}/api/config`).then((response) => response.json());
    expect(config.success).toBe(true);
    expect(config.data.config.name).toBe('test-project');

    const state = await fetch(`${server.url}/api/state`).then((response) => response.json());
    expect(state.success).toBe(true);
    expect(state.data.state.visited.value).toBe(false);
  });

  it('GET /api/diagnostics 应该返回项目诊断摘要', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const diagnostics = await fetch(`${server.url}/api/diagnostics`).then((response) => response.json());
    expect(diagnostics.success).toBe(true);
    expect(diagnostics.data.project_root).toBe(fixture.projectRoot);
    expect(Array.isArray(diagnostics.data.diagnostics)).toBe(true);
    expect(diagnostics.data.summary.total_issues).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/tools/smoke 应该返回 smoke 验证结果', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'prompt', type: 'Prompt', promptText: 'next?', stateKey: 'answer', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const smoke = await fetch(`${server.url}/api/tools/smoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: 4, inputs: ['attack'], dryRun: true }),
    }).then((response) => response.json());

    expect(smoke.success).toBe(true);
    expect(smoke.data.totalSteps).toBe(4);
    expect(smoke.data.completedSteps).toBeGreaterThan(0);
    expect(Array.isArray(smoke.data.steps)).toBe(true);
  });

  it('GET /api/tools/h5-preview 应该返回 HTML preview', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/tools/h5-preview`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('Preview');
    expect(html).toContain('Project Flows');
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

  it('应该通过 /api/runs 暴露 managed run 生命周期', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({
      flows: {
        intro: createStateMutationFlow(),
        main: createPassThroughFlow(),
      },
      initialState: {
        visited: { type: 'boolean', value: false },
      },
      session,
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const createdResponse = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.success).toBe(true);
    expect(created.data.run.status).toBe('waiting_input');
    expect(created.data.run.waiting_for).toMatchObject({
      kind: 'prompt',
      step_id: 'turn',
    });
    expect(created.data.run.input_history).toEqual([]);
    expect(created.data.run.state_summary.changed_values).toMatchObject({
      visited: { old: false, new: true },
    });

    const runId = created.data.run.run_id as string;

    const listed = await fetch(`${server.url}/api/runs`).then((response) => response.json());
    expect(listed.data.runs).toHaveLength(1);
    expect(listed.data.runs[0]).toMatchObject({
      run_id: runId,
      active: true,
    });

    const state = await fetch(`${server.url}/api/runs/${runId}/state`).then((response) => response.json());
    expect(state.data.run.state.visited.value).toBe(true);
    expect(state.data.run.input_history).toEqual([]);

    const advanced = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'attack' }),
    }).then((response) => response.json());
    expect(advanced.data.run.status).toBe('ended');
    expect(advanced.data.run.recent_events[0]).toMatchObject({
      type: 'output',
      raw: { reply: 'attack' },
    });
    expect(advanced.data.run.recent_events[1]).toEqual({
      type: 'end',
      message: 'done',
    });
    expect(advanced.data.run.input_history).toMatchObject([
      {
        step_id: 'turn',
        step_index: 1,
        input: 'attack',
      },
    ]);
  });

  it('POST /api/runs 和 /advance 应该支持 step mode', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({
      flows: {
        intro: createStateMutationFlow(),
        main: createPassThroughFlow(),
      },
      initialState: {
        visited: { type: 'boolean', value: false },
      },
      session,
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const created = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'step' }),
    }).then((response) => response.json());
    expect(created.success).toBe(true);
    expect(created.data.run.status).toBe('waiting_input');
    expect(created.data.run.waiting_for).toMatchObject({
      kind: 'prompt',
      step_id: 'turn',
    });

    const runId = created.data.run.run_id as string;
    const advanced = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'attack', mode: 'step' }),
    }).then((response) => response.json());
    expect(advanced.success).toBe(true);
    expect(advanced.data.run.status).toBe('paused');
    expect(advanced.data.run.input_history).toMatchObject([
      {
        step_id: 'turn',
        step_index: 1,
        input: 'attack',
      },
    ]);

    const finished = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'step' }),
    }).then((response) => response.json());
    expect(finished.success).toBe(true);
    expect(finished.data.run.status).toBe('ended');
  });

  it('POST /api/runs/:id/cancel 应该取消并删除 run', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then((response) => response.json());
    const runId = created.data.run.run_id as string;

    const cancelled = await fetch(`${server.url}/api/runs/${runId}/cancel`, {
      method: 'POST',
    }).then((response) => response.json());
    expect(cancelled.success).toBe(true);
    expect(cancelled.data).toEqual({
      cancelled: true,
      run_id: runId,
    });

    const missing = await fetch(`${server.url}/api/runs/${runId}`);
    expect(missing.status).toBe(404);
  });

  it('GET /api/runs/:id/stream 应该推送 run 更新事件', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const created = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
    }).then((response) => response.json());
    const runId = created.data.run.run_id as string;

    const streamResponse = await fetch(`${server.url}/api/runs/${runId}/stream`);
    expect(streamResponse.status).toBe(200);
    expect(streamResponse.body).toBeTruthy();
    const reader = streamResponse.body!.getReader();
    cleanups.push(async () => {
      await reader.cancel();
    });

    const initialEvent = await readSseEvent(reader);
    expect(initialEvent.event).toBe('run.updated');
    expect(initialEvent.data.run.run_id).toBe(runId);

    await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'attack' }),
    });

    const endedEvent = await readSseEvent(reader);
    expect(endedEvent.event).toBe('run.ended');
    expect(endedEvent.data.run.status).toBe('ended');
  });

  it('GET /api/references 应该返回项目引用索引', async () => {
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

    const result = await fetch(`${server.url}/api/references`).then((r) => r.json());
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data.entries)).toBe(true);
    expect(result.data.entries.length).toBeGreaterThan(0);

    const flowRef = result.data.entries.find((e: any) => e.kind === 'session-step->flow');
    expect(flowRef).toBeDefined();
    expect(flowRef.targetId).toBe('main');

    // Filter by resource
    const filtered = await fetch(`${server.url}/api/references?resource=flow://main`).then((r) => r.json());
    expect(filtered.success).toBe(true);
    expect(filtered.data.entries.every((e: any) => e.sourceResource === 'flow://main' || e.targetResource === 'flow://main')).toBe(true);
  });

  it('GET /api/search 应该返回搜索结果', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const result = await fetch(`${server.url}/api/search?q=pass`).then((r) => r.json());
    expect(result.success).toBe(true);
    expect(result.data.query).toBe('pass');
    expect(Array.isArray(result.data.matches)).toBe(true);
  });

  it('GET /api/flows/:id/render-prompt 应该渲染 PromptBuild 节点', async () => {
    const promptFlow: import('@kal-ai/core').FlowDefinition = {
      meta: { schemaVersion: '1.0.0' },
      data: {
        nodes: [
          {
            id: 'pb',
            type: 'PromptBuild',
            inputs: [{ name: 'data', type: 'object' }],
            outputs: [
              { name: 'messages', type: 'ChatMessage[]' },
              { name: 'text', type: 'string' },
              { name: 'estimatedTokens', type: 'number' },
            ],
            config: {
              defaultRole: 'system',
              fragments: [
                { id: 'intro', type: 'base', content: 'Hello world' },
                { id: 'cond', type: 'when', condition: 'score > 5', fragments: [{ id: 'bonus', type: 'base', content: 'Bonus!' }] },
              ],
            },
          },
        ],
        edges: [],
      },
    };
    const fixture = await createTempProject({
      flows: { prompt: promptFlow },
      initialState: { score: { type: 'number', value: 3 } },
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const result = await fetch(`${server.url}/api/flows/prompt/render-prompt?nodeId=pb`).then((r) => r.json());
    expect(result.success).toBe(true);
    expect(result.data.nodeId).toBe('pb');
    expect(result.data.renderedText).toContain('Hello world');
    expect(result.data.fragments).toHaveLength(2);
    expect(result.data.fragments[0]).toMatchObject({ id: 'intro', type: 'base', active: true });
    // score=3, condition "score > 5" should be inactive
    expect(result.data.fragments[1]).toMatchObject({ id: 'cond', type: 'when', active: false });

    // Error: non-PromptBuild node
    const errResult = await fetch(`${server.url}/api/flows/prompt/render-prompt?nodeId=nonexistent`).then((r) => r.json());
    expect(errResult.success).toBe(false);
    expect(errResult.error.code).toBe('NODE_NOT_FOUND');

    // Error: missing nodeId
    const missingResult = await fetch(`${server.url}/api/flows/prompt/render-prompt`).then((r) => r.json());
    expect(missingResult.success).toBe(false);
    expect(missingResult.error.code).toBe('MISSING_PARAM');
  });

  it('POST /api/runs with smokeInputs 应该自动推进 session', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({
      flows: {
        intro: createStateMutationFlow(),
        main: createPassThroughFlow(),
      },
      initialState: {
        visited: { type: 'boolean', value: false },
      },
      session,
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const result = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smokeInputs: ['attack'] }),
    }).then((r) => r.json());

    expect(result.success).toBe(true);
    expect(result.data.run.status).toBe('ended');
    // The smoke run should have auto-advanced through all steps
    expect(result.data.run.input_history.length).toBeGreaterThanOrEqual(1);
    expect(result.data.run.input_history[0].input).toBe('attack');
  });

  it('GET /api/prompt-preview 应该返回统一的 prompt 预览数据', async () => {
    const fixture = await createTempProject({
      flows: {
        prompt: {
          meta: { schemaVersion: '1.0.0' },
          data: {
            nodes: [
              {
                id: 'pb',
                type: 'PromptBuild',
                inputs: [],
                outputs: [
                  { name: 'messages', type: 'ChatMessage[]' },
                  { name: 'text', type: 'string' },
                ],
                config: {
                  defaultRole: 'system',
                  fragments: [{ id: 'intro', type: 'base', content: 'Hello preview' }],
                },
              },
            ],
            edges: [],
          },
        },
      },
      session: {
        schemaVersion: '1.0.0',
        steps: [
          { id: 'ask', type: 'Prompt', promptText: 'What now?', flowRef: 'prompt', inputChannel: 'message', next: 'end' },
          { id: 'end', type: 'End', message: 'done' },
        ],
      },
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const result = await fetch(`${server.url}/api/prompt-preview`).then((response) => response.json());
    expect(result.success).toBe(true);
    expect(result.data.entries.some((entry: any) => entry.id === 'session:ask')).toBe(true);
    const flowEntry = result.data.entries.find((entry: any) => entry.id === 'flow:prompt:pb');
    expect(flowEntry).toBeDefined();
    expect(flowEntry.promptText).toContain('Hello preview');
    expect(flowEntry.rendered.renderedText).toContain('Hello preview');
  });

  it('review/comments API 应该持久化 Studio 协作资源', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const reviewPayload = {
      proposals: [{ id: 'proposal-1', title: 'Review A', status: 'draft' }],
    };
    const savedReview = await fetch(`${server.url}/api/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewPayload),
    }).then((response) => response.json());
    expect(savedReview.success).toBe(true);
    expect(savedReview.data.proposals).toEqual(reviewPayload.proposals);

    const review = await fetch(`${server.url}/api/review`).then((response) => response.json());
    expect(review.data.proposals).toEqual(reviewPayload.proposals);

    const commentsPayload = {
      threads: [{ id: 'thread-1', title: 'Thread A', status: 'open', comments: [] }],
    };
    const savedComments = await fetch(`${server.url}/api/comments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentsPayload),
    }).then((response) => response.json());
    expect(savedComments.success).toBe(true);
    expect(savedComments.data.threads).toEqual(commentsPayload.threads);

    const comments = await fetch(`${server.url}/api/comments`).then((response) => response.json());
    expect(comments.data.threads).toEqual(commentsPayload.threads);
  });

  it('template/package API 应该暴露真实模板内容并应用到项目', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const packageRoot = join(fixture.projectRoot, 'packages', 'sample-template-pack');
    await mkdir(join(packageRoot, 'templates', 'story-kit', 'flows'), { recursive: true });
    await writeFile(join(packageRoot, 'manifest.json'), JSON.stringify({
      id: 'sample.template-pack',
      kind: 'template-pack',
      version: '1.0.0',
      name: 'Sample Template Pack',
      author: 'test-author',
      enabled: false,
      contributes: {
        templates: [
          {
            id: 'story-kit',
            name: 'Story Kit',
            flows: ['story'],
            sessionRef: 'story-session',
            stateKeys: ['chapter'],
          },
        ],
      },
    }, null, 2), 'utf8');
    await writeFile(join(packageRoot, 'templates', 'story-kit', 'flows', 'story.json'), JSON.stringify(createPassThroughFlow(), null, 2), 'utf8');
    await writeFile(join(packageRoot, 'templates', 'story-kit', 'session.json'), JSON.stringify({
      schemaVersion: '1.0.0',
      entryStep: 'intro',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'story', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    }, null, 2), 'utf8');
    await writeFile(join(packageRoot, 'templates', 'story-kit', 'initial_state.json'), JSON.stringify({
      chapter: { type: 'number', value: 1 },
    }, null, 2), 'utf8');

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const packages = await fetch(`${server.url}/api/packages`).then((response) => response.json());
    expect(packages.success).toBe(true);
    expect(packages.data[0]).toMatchObject({
      manifest: { id: 'sample.template-pack' },
      trustLevel: 'third-party',
      enabled: false,
    });

    const bundle = await fetch(`${server.url}/api/packages/sample.template-pack/templates/story-kit`).then((response) => response.json());
    expect(bundle.success).toBe(true);
    expect(bundle.data.summary.flowIds).toEqual(['story']);
    expect(bundle.data.summary.hasSession).toBe(true);
    expect(bundle.data.summary.stateKeys).toEqual(['chapter']);

    const applied = await fetch(`${server.url}/api/packages/sample.template-pack/templates/story-kit/apply`, {
      method: 'POST',
    }).then((response) => response.json());
    expect(applied.success).toBe(true);
    expect(runtime.getFlow('story').meta.inputs?.[0]?.name).toBe('message');
    expect(runtime.getSession()?.entryStep).toBe('intro');
    expect(runtime.getState().chapter.value).toBe(1);
  });
});
