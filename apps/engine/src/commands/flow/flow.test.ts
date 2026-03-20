import { afterEach, describe, expect, it } from 'vitest';
import type { FlowDefinition } from '@kal-ai/core';
import { runCli } from '../../cli';
import type { EngineCliIO } from '../../types';
import { createPassThroughFlow, createTempProject } from '../../test-helpers';

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

function createPromptFlow(): FlowDefinition {
  return {
    meta: {
      schemaVersion: '1.0.0',
      outputs: [{ name: 'text', type: 'string' }],
    },
    data: {
      nodes: [
        {
          id: 'prompt-builder',
          type: 'PromptBuild',
          inputs: [{ name: 'data', type: 'object', defaultValue: {} }],
          outputs: [
            { name: 'text', type: 'string' },
            { name: 'estimatedTokens', type: 'number' },
          ],
          config: {
            fragments: [{ id: 'intro', type: 'base', content: 'Hello there' }],
          },
        },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'text' },
        },
      ],
      edges: [
        {
          source: 'prompt-builder',
          sourceHandle: 'text',
          target: 'signal-out',
          targetHandle: 'data',
        },
      ],
    },
  };
}

describe('flow commands', () => {
  it('lists flows using the envelope format', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createPassThroughFlow(),
        scene: createPromptFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli(['flow', 'list', fixture.projectRoot], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.command).toBe('flow.list');
    expect(payload.data.flows).toHaveLength(2);
  });

  it('auto-fills node handles when adding a builtin node', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createPassThroughFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli([
      'flow',
      'node',
      'add',
      'main',
      fixture.projectRoot,
      '--json',
      '{"id":"constant","type":"Constant","config":{"value":"hi","type":"string"}}',
    ], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.data.node.outputs[0].name).toBe('value');
  });

  it('adds fragments to PromptBuild nodes', async () => {
    const fixture = await createTempProject({
      flows: {
        scene: createPromptFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli([
      'flow',
      'node',
      'fragment',
      'add',
      'scene',
      'prompt-builder',
      fixture.projectRoot,
      '--json',
      '{"type":"base","id":"rules","content":"Follow the rules"}',
    ], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.data.fragment.id).toBe('rules');
  });

  it('executes flows with JSON input', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createPassThroughFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli(['flow', 'execute', 'main', fixture.projectRoot, '--input', '{"message":"attack"}'], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.data.outputs.reply).toBe('attack');
  });

  it('returns structured errors for missing flows', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createPassThroughFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli(['flow', 'show', 'missing', fixture.projectRoot], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(1);
    expect(payload.status).toBe('error');
    expect(payload.errors[0].error_code).toBe('FLOW_NOT_FOUND');
    expect(payload.errors[0].retryable).toBe(false);
    expect(payload.errors[0].hint).toContain('kal flow list');
  });
});
