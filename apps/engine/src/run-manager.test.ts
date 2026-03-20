import { afterEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionDefinition } from '@kal-ai/core';
import { RunManager } from './run-manager';
import { EngineRuntime } from './runtime';
import { createPassThroughFlow, createStateMutationFlow, createTempProject } from './test-helpers';

const cleanups: Array<() => Promise<void>> = [];

function createRetryableFlow() {
  return {
    meta: {
      schemaVersion: '1.0.0',
      inputs: [{ name: 'message', type: 'string', required: true }],
      outputs: [{ name: 'reply', type: 'string' }],
    },
    data: {
      nodes: [
        {
          id: 'signal-in',
          type: 'SignalIn',
          inputs: [],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'message' },
        },
        {
          id: 'retryable',
          type: 'RetryableNode',
          inputs: [{ name: 'message', type: 'string', required: true }],
          outputs: [{ name: 'data', type: 'string' }],
        },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'reply' },
        },
      ],
      edges: [
        { source: 'signal-in', sourceHandle: 'data', target: 'retryable', targetHandle: 'message' },
        { source: 'retryable', sourceHandle: 'data', target: 'signal-out', targetHandle: 'data' },
      ],
    },
  } as const;
}

afterEach(async () => {
  delete process.env.KAL_RETRY_NODE_FAIL;
  while (cleanups.length > 0) {
    await cleanups.pop()!();
  }
});

describe('RunManager', () => {
  it('should create a managed run and stop at the first input boundary', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', promptText: 'Your move?', flowRef: 'main', inputChannel: 'message', next: 'end' },
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
    const runs = RunManager.fromRuntime(runtime);

    const created = await runs.createRun();

    expect(created.run.status).toBe('waiting_input');
    expect(created.run.waiting_for).toMatchObject({
      kind: 'prompt',
      step_id: 'turn',
    });
    expect(created.run.state_summary.changed_values).toMatchObject({
      visited: { old: false, new: true },
    });
    expect(created.run.recent_events).toHaveLength(1);
  });

  it('should keep multiple saved runs isolated when forcing a new active run', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: 'Your move?', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const runs = RunManager.fromRuntime(runtime);

    const first = await runs.createRun();
    const second = await runs.createRun({ forceNew: true });

    expect(first.run.run_id).not.toBe(second.run.run_id);

    const firstAdvance = await runs.advanceRun({
      runId: first.run.run_id,
      input: 'alpha',
    });
    const secondAdvance = await runs.advanceRun({
      runId: second.run.run_id,
      input: 'beta',
    });

    expect(firstAdvance.run.status).toBe('ended');
    expect(secondAdvance.run.status).toBe('ended');
    expect(firstAdvance.run.recent_events[0]).toMatchObject({
      type: 'output',
      raw: { reply: 'alpha' },
    });
    expect(secondAdvance.run.recent_events[0]).toMatchObject({
      type: 'output',
      raw: { reply: 'beta' },
    });
  });

  it('should invalidate stale runs when session files change', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: 'Your move?', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const runs = RunManager.fromRuntime(runtime);
    const events: string[] = [];
    const unsubscribe = runs.subscribe((event) => {
      events.push(event.type);
    });
    cleanups.push(async () => unsubscribe());

    const created = await runs.createRun();
    const nextSession: SessionDefinition = {
      ...session,
      steps: [
        ...session.steps,
        { id: 'after', type: 'End', message: 'changed' },
      ],
    };
    await writeFile(join(fixture.projectRoot, 'session.json'), JSON.stringify(nextSession, null, 2), 'utf8');

    await expect(runs.advanceRun({
      runId: created.run.run_id,
      input: 'alpha',
    })).rejects.toMatchObject({
      code: 'SESSION_HASH_MISMATCH',
    });
    expect(events).toContain('run.invalidated');
  });

  it('should retry the failed step on the same run', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: 'Your move?', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };
    const fixture = await createTempProject({
      flows: {
        main: createRetryableFlow(),
      },
      customNodeSource: `export default {
        type: 'RetryableNode',
        label: 'Retryable Node',
        inputs: [{ name: 'message', type: 'string', required: true }],
        outputs: [{ name: 'data', type: 'string' }],
        async execute(inputs) {
          if (process.env.KAL_RETRY_NODE_FAIL === '1') {
            throw new Error('model failed');
          }
          return { data: inputs.message };
        }
      };`,
      session,
    });
    cleanups.push(fixture.cleanup);

    const runtime = await EngineRuntime.create(fixture.projectRoot);
    const runs = RunManager.fromRuntime(runtime);

    const created = await runs.createRun();
    process.env.KAL_RETRY_NODE_FAIL = '1';
    const failed = await runs.advanceRun({
      runId: created.run.run_id,
      input: 'attack',
    });
    expect(failed.run.status).toBe('error');
    expect(failed.run.input_history).toMatchObject([
      {
        step_id: 'turn',
        step_index: 0,
        input: 'attack',
      },
    ]);

    process.env.KAL_RETRY_NODE_FAIL = '0';

    const retried = await runs.retryRun({ runId: created.run.run_id });

    expect(retried.run.run_id).toBe(created.run.run_id);
    expect(retried.run.status).toBe('ended');
    expect(retried.run.recent_events).toMatchObject([
      {
        type: 'output',
        raw: { reply: 'attack' },
      },
      {
        type: 'end',
        message: 'done',
      },
    ]);
    expect(retried.run.input_history).toMatchObject([
      {
        step_id: 'turn',
        step_index: 0,
        input: 'attack',
      },
    ]);
  });
});
