import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowDefinition, SessionDefinition, StateValue } from '@kal-ai/core';
import type { EngineCliIO } from '../types';
import { runLintCommand } from './lint';
import { runSmokeCommand } from './smoke';
import { createTempProject } from '../test-helpers';

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

function createConstantFlow(): FlowDefinition {
  return {
    meta: {
      schemaVersion: '1.0.0',
      outputs: [{ name: 'value', type: 'any' }],
    },
    data: {
      nodes: [
        {
          id: 'constant',
          type: 'Constant',
          inputs: [],
          outputs: [{ name: 'value', type: 'any' }],
          config: { value: '', type: 'string' },
        },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'any' }],
          outputs: [{ name: 'data', type: 'any' }],
          config: { channel: 'value' },
        },
      ],
      edges: [
        {
          source: 'constant',
          sourceHandle: 'value',
          target: 'signal-out',
          targetHandle: 'data',
        },
      ],
    },
  };
}

describe('lint command', () => {
  it('should accept empty string for required string config fields', async () => {
    const fixture = await createTempProject({
      flows: {
        constant: createConstantFlow(),
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runLintCommand([fixture.projectRoot, '--format', 'json'], {
      cwd: process.cwd(),
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(payload.diagnostics.some((diag: { code: string }) => diag.code === 'CONFIG_MISSING_REQUIRED')).toBe(false);
  });

  it('should validate custom node manifests', async () => {
    const fixture = await createTempProject({
      customNodeSource: `
        export default {
          type: 'CustomNode',
          label: 'Custom Node',
          category: 'test',
          inputs: [{ name: 'input', type: 'string', required: true }],
          outputs: [{ name: 'data', type: 'string' }],
          configSchema: {
            type: 'object',
            required: ['mode'],
            properties: {
              mode: { type: 'string' }
            },
            additionalProperties: false
          },
          defaultConfig: {},
          async execute() {
            return { data: 'ok' };
          }
        };
      `,
      flows: {
        custom: {
          meta: {
            schemaVersion: '1.0.0',
            outputs: [{ name: 'value', type: 'string' }],
          },
          data: {
            nodes: [
              {
                id: 'custom',
                type: 'CustomNode',
                inputs: [{ name: 'input', type: 'string', required: true }],
                outputs: [{ name: 'data', type: 'string' }],
                config: {},
              },
              {
                id: 'signal-out',
                type: 'SignalOut',
                inputs: [{ name: 'data', type: 'string' }],
                outputs: [{ name: 'data', type: 'string' }],
                config: { channel: 'value' },
              },
            ],
            edges: [
              {
                source: 'custom',
                sourceHandle: 'data',
                target: 'signal-out',
                targetHandle: 'data',
              },
            ],
          },
        },
      },
    });
    cleanups.push(fixture.cleanup);

    const buffer = createIoBuffer();
    const exitCode = await runLintCommand([fixture.projectRoot, '--format', 'json'], {
      cwd: process.cwd(),
      io: buffer.io,
    });

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(1);
    expect(payload.diagnostics.some((diag: { code: string; message: string }) =>
      diag.code === 'CONFIG_MISSING_REQUIRED' && diag.message.includes('CustomNode')
    )).toBe(true);
    expect(payload.diagnostics.some((diag: { code: string; message: string }) =>
      diag.code === 'MISSING_REQUIRED_INPUT' && diag.message.includes('CustomNode')
    )).toBe(true);
  });
});

describe('smoke command', () => {
  it('should keep dry-run free of flow execution and state writes', async () => {
    const state: Record<string, StateValue> = {
      playerName: { type: 'string', value: '' },
    };
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'name' },
        { id: 'name', type: 'Prompt', promptText: 'Name?', stateKey: 'playerName', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const runtime = {
      hasSession: () => true,
      getSession: () => session,
      getState: vi.fn(() => state),
      getProject: () => ({ projectRoot: '/tmp/project' }),
      executeFlow: vi.fn(async () => ({ executionId: 'exec', flowId: 'intro', outputs: {}, errors: [], durationMs: 0 })),
      setState: vi.fn(),
    };

    const buffer = createIoBuffer();
    const exitCode = await runSmokeCommand(
      ['project', '--steps', '2', '--input', 'Alice', '--dry-run', '--format', 'json'],
      {
        cwd: '/tmp',
        io: buffer.io,
        createRuntime: vi.fn().mockResolvedValue(runtime as any),
      },
    );

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(runtime.executeFlow).not.toHaveBeenCalled();
    expect(runtime.setState).not.toHaveBeenCalled();
    expect(state.playerName.value).toBe('');
    expect(payload.dryRun).toBe(true);
  });

  it('should execute non-interactive steps without misrouting user input', async () => {
    const state: Record<string, StateValue> = {
      picked: { type: 'string', value: '' },
    };
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'choose' },
        {
          id: 'choose',
          type: 'Choice',
          promptText: 'Pick one',
          options: [{ label: 'Left', value: 'left' }],
          stateKey: 'picked',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    };

    const runtime = {
      hasSession: () => true,
      getSession: () => session,
      getState: vi.fn(() => state),
      getProject: () => ({ projectRoot: '/tmp/project' }),
      executeFlow: vi.fn(async () => ({ executionId: 'exec', flowId: 'intro', outputs: { ok: true }, errors: [], durationMs: 0 })),
      setState: vi.fn((key: string, value: string) => {
        state[key] = { ...state[key], value };
      }),
    };

    const buffer = createIoBuffer();
    const exitCode = await runSmokeCommand(
      ['project', '--steps', '2', '--input', 'left', '--format', 'json'],
      {
        cwd: '/tmp',
        io: buffer.io,
        createRuntime: vi.fn().mockResolvedValue(runtime as any),
      },
    );

    const payload = parseJsonOutput(buffer);
    expect(exitCode).toBe(0);
    expect(runtime.executeFlow).toHaveBeenCalledTimes(1);
    expect(runtime.setState).toHaveBeenCalledWith('picked', 'left');
    expect(payload.steps[0].error).toBeUndefined();
    expect(payload.steps[1].error).toBeUndefined();
  });
});
