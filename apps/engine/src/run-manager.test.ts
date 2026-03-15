import { afterEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionDefinition } from '@kal-ai/core';
import { RunManager } from './run-manager';
import { EngineRuntime } from './runtime';
import { createPassThroughFlow, createStateMutationFlow, createTempProject } from './test-helpers';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
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
});
