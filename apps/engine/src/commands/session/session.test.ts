import { afterEach, describe, expect, it } from 'vitest';
import type { SessionDefinition, StateValue } from '@kal-ai/core';
import { runCli } from '../../cli';
import type { EngineCliIO } from '../../types';
import { createTempProject } from '../../test-helpers';

function createIoBuffer(): { io: EngineCliIO; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout(message: string) {
        stdout.push(message);
      },
      stderr(message: string) {
        stderr.push(message);
      },
    },
  };
}

function parseJsonOutput(buffer: { stdout: string[] }): any {
  return JSON.parse(buffer.stdout.join(''));
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!();
  }
});

function createSessionFixture(): SessionDefinition {
  return {
    schemaVersion: '1.0.0',
    entryStep: 'intro',
    steps: [
      { id: 'intro', type: 'Prompt', promptText: 'Name?', stateKey: 'playerName', next: 'end' },
      { id: 'end', type: 'End', message: 'done' },
    ],
  };
}

describe('session commands', () => {
  it('shows the current session using the envelope format', async () => {
    const fixture = await createTempProject({
      initialState: {
        playerName: { type: 'string', value: '' } satisfies StateValue,
      },
      session: createSessionFixture(),
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli(['session', 'show', fixture.projectRoot], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.command).toBe('session.show');
    expect(payload.status).toBe('ok');
    expect(payload.errors).toEqual([]);
    expect(payload.data.steps).toHaveLength(2);
  });

  it('updates session metadata and persists it', async () => {
    const fixture = await createTempProject({
      initialState: {
        playerName: { type: 'string', value: '' } satisfies StateValue,
      },
      session: createSessionFixture(),
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli(['session', 'meta-set', fixture.projectRoot, '--name', 'Adventure', '--entry-step', 'intro'], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.data.name).toBe('Adventure');
    expect(payload.data.entryStep).toBe('intro');
  });

  it('patches an individual step via --set', async () => {
    const fixture = await createTempProject({
      initialState: {
        playerName: { type: 'string', value: '' } satisfies StateValue,
      },
      session: createSessionFixture(),
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli(['session', 'step', 'patch', 'intro', fixture.projectRoot, '--set', 'promptText=Choose your hero'], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.data.step.promptText).toBe('Choose your hero');
  });

  it('returns structured errors for missing steps', async () => {
    const fixture = await createTempProject({
      initialState: {
        playerName: { type: 'string', value: '' } satisfies StateValue,
      },
      session: createSessionFixture(),
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli(['session', 'step', 'show', 'missing', fixture.projectRoot], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(1);
    expect(payload.status).toBe('error');
    expect(payload.errors[0].error_code).toBe('STEP_NOT_FOUND');
    expect(payload.errors[0].retryable).toBe(false);
    expect(payload.errors[0].hint).toContain('kal session step list');
  });
});
