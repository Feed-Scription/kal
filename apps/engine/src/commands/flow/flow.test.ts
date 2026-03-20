import { afterEach, describe, expect, it } from 'vitest';
import type { FlowDefinition, SessionDefinition } from '@kal-ai/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

  it('can create a missing flow even when session.json already references it', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'RunFlow', flowRef: 'future-flow', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };
    const fixture = await createTempProject({ session });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli([
      'flow',
      'create',
      'future-flow',
      fixture.projectRoot,
      '--json',
      JSON.stringify(createPassThroughFlow()),
    ], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.status).toBe('ok');
    expect(JSON.parse(await readFile(join(fixture.projectRoot, 'flow', 'future-flow.json'), 'utf8')).meta.schemaVersion).toBe('1.0.0');
  });

  it('supports batch node config updates across all flows by node type', async () => {
    const fixture = await createTempProject({
      flows: {
        main: createPassThroughFlow(),
        side: createPassThroughFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli([
      'flow',
      'node',
      'config-set',
      '--all-flows',
      '--node-type',
      'SignalOut',
      '--set',
      'timeout=120000',
    ], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    const mainFlow = JSON.parse(await readFile(join(fixture.projectRoot, 'flow', 'main.json'), 'utf8'));
    const sideFlow = JSON.parse(await readFile(join(fixture.projectRoot, 'flow', 'side.json'), 'utf8'));
    expect(exitCode).toBe(0);
    expect(payload.data.totalFlows).toBe(2);
    expect(payload.data.totalNodes).toBe(2);
    expect(mainFlow.data.nodes.find((node: { id: string }) => node.id === 'signal-out')?.config.timeout).toBe(120000);
    expect(sideFlow.data.nodes.find((node: { id: string }) => node.id === 'signal-out')?.config.timeout).toBe(120000);
  });

  it('supports structured selectors with flow globs, node globs, and --where filters', async () => {
    const fixture = await createTempProject({
      flows: {
        main: {
          ...createPassThroughFlow(),
          data: {
            ...createPassThroughFlow().data,
            nodes: createPassThroughFlow().data.nodes.map((node) =>
              node.type === 'SignalOut'
                ? {
                    ...node,
                    config: {
                      ...node.config,
                      model: 'gpt-4o',
                    },
                  }
                : node
            ),
          },
        },
        side: createPassThroughFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli([
      'flow',
      'node',
      'config-set',
      '--flow',
      'ma*',
      '--node-type',
      'Signal*',
      '--node-id',
      'signal-*',
      '--where',
      'config.model=gpt-4o',
      '--set',
      'timeout=90000',
    ], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    const mainFlow = JSON.parse(await readFile(join(fixture.projectRoot, 'flow', 'main.json'), 'utf8'));
    const sideFlow = JSON.parse(await readFile(join(fixture.projectRoot, 'flow', 'side.json'), 'utf8'));

    expect(exitCode).toBe(0);
    expect(payload.data.totalFlows).toBe(1);
    expect(payload.data.totalNodes).toBe(1);
    expect(mainFlow.data.nodes.find((node: { id: string }) => node.id === 'signal-out')?.config.timeout).toBe(90000);
    expect(sideFlow.data.nodes.find((node: { id: string }) => node.id === 'signal-out')?.config.timeout).toBeUndefined();
  });

  it('requires explicit batch scope for selector mode', async () => {
    const fixture = await createTempProject();
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runCli([
      'flow',
      'node',
      'config-set',
      '--node-type',
      'SignalOut',
      '--set',
      'timeout=120000',
    ], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(1);
    expect(payload.errors[0].error_code).toBe('NODE_SELECTOR_SCOPE_REQUIRED');
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
