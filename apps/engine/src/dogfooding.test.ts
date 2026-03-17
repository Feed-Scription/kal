/**
 * Dogfooding tests for the managed run runtime.
 *
 * These tests exercise the full lifecycle of the /api/runs endpoints
 * through the HTTP server, simulating real editor/client usage patterns.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionDefinition } from '@kal-ai/core';
import { EngineRuntime } from './runtime';
import { startEngineServer } from './server';
import { createPassThroughFlow, createStateMutationFlow, createTempProject } from './test-helpers';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!();
  }
});

async function boot(session: SessionDefinition, flows?: Record<string, any>, initialState?: Record<string, any>) {
  const fixture = await createTempProject({
    flows: flows ?? { main: createPassThroughFlow() },
    session,
    initialState,
  });
  cleanups.push(fixture.cleanup);

  const runtime = await EngineRuntime.create(fixture.projectRoot);
  const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
  cleanups.push(server.close);

  return { fixture, runtime, server };
}

function readSseEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  count: number,
  timeoutMs = 3000,
): Promise<Array<{ event: string; data: any }>> {
  const decoder = new TextDecoder();
  let buffer = '';
  const events: Array<{ event: string; data: any }> = [];

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after collecting ${events.length}/${count} SSE events`)), timeoutMs);

    const pump = async () => {
      try {
        while (events.length < count) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });

          while (true) {
            const boundary = buffer.indexOf('\n\n');
            if (boundary < 0) break;
            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (!rawEvent || rawEvent.startsWith(':')) continue;

            const lines = rawEvent.split('\n');
            let event = 'message';
            let data = '';
            for (const line of lines) {
              if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
              if (line.startsWith('data:')) data += line.slice('data:'.length).trim();
            }
            events.push({ event, data: data ? JSON.parse(data) : null });
            if (events.length >= count) break;
          }
        }
        clearTimeout(timer);
        resolve(events);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    };
    pump();
  });
}

// ─── Session fixtures ────────────────────────────────────────────────

/** Simple: intro flow → prompt → end */
const SIMPLE_SESSION: SessionDefinition = {
  schemaVersion: '1.0.0',
  steps: [
    { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
    { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
    { id: 'end', type: 'End', message: 'done' },
  ],
};

/** Multi-turn: prompt → prompt → end */
const MULTI_TURN_SESSION: SessionDefinition = {
  schemaVersion: '1.0.0',
  steps: [
    { id: 'turn1', type: 'Prompt', promptText: '第一回合', flowRef: 'main', inputChannel: 'message', next: 'turn2' },
    { id: 'turn2', type: 'Prompt', promptText: '第二回合', flowRef: 'main', inputChannel: 'message', next: 'end' },
    { id: 'end', type: 'End', message: '结束' },
  ],
};

/** Choice-based session */
const CHOICE_SESSION: SessionDefinition = {
  schemaVersion: '1.0.0',
  steps: [
    {
      id: 'pick',
      type: 'Choice',
      promptText: '选择路线',
      options: [
        { label: '攻击', value: 'attack' },
        { label: '防御', value: 'defend' },
      ],
      flowRef: 'main',
      inputChannel: 'message',
      next: 'end',
    },
    { id: 'end', type: 'End', message: '选择完毕' },
  ],
};

/** Prompt-only (no RunFlow before it) */
const PROMPT_ONLY_SESSION: SessionDefinition = {
  schemaVersion: '1.0.0',
  steps: [
    { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
    { id: 'end', type: 'End', message: 'done' },
  ],
};

/** Auto-run session (no prompts, just RunFlow → End) */
const AUTO_RUN_SESSION: SessionDefinition = {
  schemaVersion: '1.0.0',
  steps: [
    { id: 'run', type: 'RunFlow', flowRef: 'intro', next: 'end' },
    { id: 'end', type: 'End', message: 'auto done' },
  ],
};

// ─── Error handling tests ────────────────────────────────────────────

describe('Dogfooding: error handling', () => {
  it('POST /api/runs 重复创建应返回 409', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const first = await fetch(`${server.url}/api/runs`, { method: 'POST' });
    expect(first.status).toBe(201);

    const second = await fetch(`${server.url}/api/runs`, { method: 'POST' });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ACTIVE_RUN_EXISTS');
  });

  it('POST /api/runs/:id/advance 缺少 input 应返回 400', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    const resp = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe('INPUT_REQUIRED');
  });

  it('POST /api/runs/:id/advance 对已结束 run 应返回 409', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    // Advance to end
    await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hello' }),
    });

    // Try to advance again
    const resp = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'again' }),
    });
    expect(resp.status).toBe(409);
    const body = await resp.json();
    expect(body.error.code).toBe('RUN_NOT_ACTIVE');
  });

  it('GET /api/runs/:id 不存在的 runId 应返回 404', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const resp = await fetch(`${server.url}/api/runs/nonexistent`);
    expect(resp.status).toBe(404);
  });

  it('POST /api/runs 无 session 的项目应返回 400', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);
    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const server = await startEngineServer({ runtime, host: '127.0.0.1', port: 0 });
    cleanups.push(server.close);

    const resp = await fetch(`${server.url}/api/runs`, { method: 'POST' });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe('NO_SESSION');
  });
});

// ─── Multi-turn conversation tests ──────────────────────────────────

describe('Dogfooding: multi-turn conversations', () => {
  it('应该正确处理两轮 Prompt 对话', async () => {
    const { server } = await boot(MULTI_TURN_SESSION);

    // Create run → should pause at turn1
    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    expect(created.data.run.status).toBe('waiting_input');
    expect(created.data.run.waiting_for).toMatchObject({ kind: 'prompt', step_id: 'turn1' });
    const runId = created.data.run.run_id;

    // Advance with first input → should pause at turn2
    const turn1 = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '第一步' }),
    }).then(r => r.json());
    expect(turn1.data.run.status).toBe('waiting_input');
    expect(turn1.data.run.waiting_for).toMatchObject({ kind: 'prompt', step_id: 'turn2' });

    // Advance with second input → should end
    const turn2 = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '第二步' }),
    }).then(r => r.json());
    expect(turn2.data.run.status).toBe('ended');
    expect(turn2.data.run.recent_events).toContainEqual({ type: 'end', message: '结束' });
  });

  it('intro flow + prompt 的完整生命周期', async () => {
    const { server } = await boot(SIMPLE_SESSION, {
      intro: createStateMutationFlow(),
      main: createPassThroughFlow(),
    }, { visited: { type: 'boolean', value: false } });

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    expect(created.data.run.status).toBe('waiting_input');
    expect(created.data.run.state_summary.changed_values).toHaveProperty('visited');

    const runId = created.data.run.run_id;

    // Check state endpoint
    const state = await fetch(`${server.url}/api/runs/${runId}/state`).then(r => r.json());
    expect(state.data.run.state.visited.value).toBe(true);

    // Advance to end
    const ended = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'attack' }),
    }).then(r => r.json());
    expect(ended.data.run.status).toBe('ended');
    expect(ended.data.run.recent_events[0]).toMatchObject({ type: 'output', raw: { reply: 'attack' } });
  });
});

// ─── Choice step tests ──────────────────────────────────────────────

describe('Dogfooding: Choice steps', () => {
  it('Choice step 应该返回选项列表并接受选择', async () => {
    const { server } = await boot(CHOICE_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    expect(created.data.run.status).toBe('waiting_input');
    expect(created.data.run.waiting_for).toMatchObject({
      kind: 'choice',
      step_id: 'pick',
    });
    expect(created.data.run.waiting_for.options).toEqual([
      { label: '攻击', value: 'attack' },
      { label: '防御', value: 'defend' },
    ]);

    const runId = created.data.run.run_id;
    const advanced = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'attack' }),
    }).then(r => r.json());
    expect(advanced.data.run.status).toBe('ended');
  });
});

// ─── Auto-run (no input needed) tests ───────────────────────────────

describe('Dogfooding: auto-run sessions', () => {
  it('无 Prompt 的 session 应该直接运行到 ended', async () => {
    const { server } = await boot(AUTO_RUN_SESSION, {
      intro: createStateMutationFlow(),
      main: createPassThroughFlow(),
    }, { visited: { type: 'boolean', value: false } });

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    expect(created.data.run.status).toBe('ended');
    expect(created.data.run.waiting_for).toBeNull();
    expect(created.data.run.recent_events).toContainEqual({ type: 'end', message: 'auto done' });
  });

  it('auto-run 结束后不应有 active run', async () => {
    const { server } = await boot(AUTO_RUN_SESSION, {
      intro: createStateMutationFlow(),
      main: createPassThroughFlow(),
    }, { visited: { type: 'boolean', value: false } });

    await fetch(`${server.url}/api/runs`, { method: 'POST' });

    const listed = await fetch(`${server.url}/api/runs`).then(r => r.json());
    // The run should exist but not be active
    expect(listed.data.runs.length).toBe(1);
    expect(listed.data.runs[0].active).toBe(false);
  });
});

// ─── forceNew and run isolation tests ───────────────────────────────

describe('Dogfooding: forceNew and run isolation', () => {
  it('forceNew 应该创建新 run 并保持旧 run 可访问', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const first = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const firstId = first.data.run.run_id;

    const second = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceNew: true }),
    }).then(r => r.json());
    const secondId = second.data.run.run_id;

    expect(firstId).not.toBe(secondId);

    // Both runs should be accessible
    const firstRun = await fetch(`${server.url}/api/runs/${firstId}`).then(r => r.json());
    expect(firstRun.success).toBe(true);

    const secondRun = await fetch(`${server.url}/api/runs/${secondId}`).then(r => r.json());
    expect(secondRun.success).toBe(true);
  });

  it('两个 run 的 advance 应该互不影响', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const first = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const second = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceNew: true }),
    }).then(r => r.json());

    const r1 = await fetch(`${server.url}/api/runs/${first.data.run.run_id}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'alpha' }),
    }).then(r => r.json());

    const r2 = await fetch(`${server.url}/api/runs/${second.data.run.run_id}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'beta' }),
    }).then(r => r.json());

    expect(r1.data.run.recent_events[0].raw.reply).toBe('alpha');
    expect(r2.data.run.recent_events[0].raw.reply).toBe('beta');
  });
});

// ─── Session hash invalidation tests ────────────────────────────────

describe('Dogfooding: session hash invalidation', () => {
  it('session 文件变更后 advance 应返回 409 SESSION_HASH_MISMATCH', async () => {
    const { fixture, server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    // Mutate session.json on disk
    const mutated: SessionDefinition = {
      ...PROMPT_ONLY_SESSION,
      steps: [
        ...PROMPT_ONLY_SESSION.steps,
        { id: 'extra', type: 'End', message: 'extra' },
      ],
    };
    await writeFile(join(fixture.projectRoot, 'session.json'), JSON.stringify(mutated, null, 2), 'utf8');

    const resp = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hello' }),
    });
    expect(resp.status).toBe(409);
    const body = await resp.json();
    expect(body.error.code).toBe('SESSION_HASH_MISMATCH');
  });

  it('flow 文件变更也应触发 hash 失效', async () => {
    const { fixture, server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    // Mutate flow file on disk
    const mutatedFlow = createPassThroughFlow();
    mutatedFlow.meta.description = 'mutated';
    await writeFile(
      join(fixture.projectRoot, 'flow', 'main.json'),
      JSON.stringify(mutatedFlow, null, 2),
      'utf8',
    );

    const resp = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hello' }),
    });
    expect(resp.status).toBe(409);
    const body = await resp.json();
    expect(body.error.code).toBe('SESSION_HASH_MISMATCH');
  });
});

// ─── Cancel and cleanup tests ───────────────────────────────────────

describe('Dogfooding: cancel and cleanup', () => {
  it('cancel 后 run 应从 list 中消失', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    await fetch(`${server.url}/api/runs/${runId}/cancel`, { method: 'POST' });

    const listed = await fetch(`${server.url}/api/runs`).then(r => r.json());
    expect(listed.data.runs).toHaveLength(0);
  });

  it('cleanup=true 时 ended run 应自动删除', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hello', cleanup: true }),
    });

    const listed = await fetch(`${server.url}/api/runs`).then(r => r.json());
    expect(listed.data.runs).toHaveLength(0);
  });

  it('cleanup=false 时 ended run 应保留', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hello', cleanup: false }),
    });

    const listed = await fetch(`${server.url}/api/runs`).then(r => r.json());
    expect(listed.data.runs).toHaveLength(1);
    expect(listed.data.runs[0].run_id).toBe(runId);
  });
});

// ─── SSE stream tests ───────────────────────────────────────────────

describe('Dogfooding: SSE streaming', () => {
  it('stream 应该推送 create → advance → ended 事件序列', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    const streamResp = await fetch(`${server.url}/api/runs/${runId}/stream`);
    expect(streamResp.status).toBe(200);
    expect(streamResp.headers.get('content-type')).toContain('text/event-stream');

    const reader = streamResp.body!.getReader();
    cleanups.push(async () => { await reader.cancel(); });

    // Should get initial run.updated event
    const events = await readSseEvents(reader, 1);
    expect(events[0].event).toBe('run.updated');
    expect(events[0].data.run.run_id).toBe(runId);

    // Advance the run
    await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hello' }),
    });

    // Should get run.ended event
    const endEvents = await readSseEvents(reader, 1);
    expect(endEvents[0].event).toBe('run.ended');
    expect(endEvents[0].data.run.status).toBe('ended');
  });

  it('cancel 应该通过 stream 推送 run.cancelled 事件', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    const streamResp = await fetch(`${server.url}/api/runs/${runId}/stream`);
    const reader = streamResp.body!.getReader();
    cleanups.push(async () => { await reader.cancel(); });

    // Consume initial event
    await readSseEvents(reader, 1);

    // Cancel the run
    await fetch(`${server.url}/api/runs/${runId}/cancel`, { method: 'POST' });

    const cancelEvents = await readSseEvents(reader, 1);
    expect(cancelEvents[0].event).toBe('run.cancelled');
  });
});

// ─── State summary and events tests ─────────────────────────────────

describe('Dogfooding: state summary and events', () => {
  it('state_summary 应该正确反映 state 变化', async () => {
    const { server } = await boot(SIMPLE_SESSION, {
      intro: createStateMutationFlow(),
      main: createPassThroughFlow(),
    }, { visited: { type: 'boolean', value: false } });

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const summary = created.data.run.state_summary;

    expect(summary.total_keys).toBeGreaterThan(0);
    expect(summary.keys).toContain('visited');
    expect(summary.changed).toContain('visited');
    expect(summary.preview).toHaveProperty('visited');
  });

  it('recent_events 应该包含 output 和 end 事件', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const created = await fetch(`${server.url}/api/runs`, { method: 'POST' }).then(r => r.json());
    const runId = created.data.run.run_id;

    const advanced = await fetch(`${server.url}/api/runs/${runId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'test-input' }),
    }).then(r => r.json());

    const events = advanced.data.run.recent_events;
    expect(events.some((e: any) => e.type === 'output')).toBe(true);
    expect(events.some((e: any) => e.type === 'end')).toBe(true);

    const outputEvent = events.find((e: any) => e.type === 'output');
    expect(outputEvent.raw.reply).toBe('test-input');
    expect(outputEvent.normalized).toBeDefined();
    expect(outputEvent.normalized.labels).toBeInstanceOf(Array);
  });
});

// ─── CORS and protocol tests ────────────────────────────────────────

describe('Dogfooding: CORS and protocol', () => {
  it('OPTIONS 预检请求应返回 204 和 CORS 头', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const resp = await fetch(`${server.url}/api/runs`, { method: 'OPTIONS' });
    expect(resp.status).toBe(204);
    expect(resp.headers.get('access-control-allow-origin')).toBe('*');
    expect(resp.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('不存在的路由应返回 404', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const resp = await fetch(`${server.url}/api/nonexistent`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('错误的 Content-Type 应返回 415', async () => {
    const { server } = await boot(PROMPT_ONLY_SESSION);

    const resp = await fetch(`${server.url}/api/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"flowId":"main"}',
    });
    expect(resp.status).toBe(415);
    const body = await resp.json();
    expect(body.error.code).toBe('UNSUPPORTED_CONTENT_TYPE');
  });
});
