import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from './cli';
import type { EngineCliIO, StartedEngineServer } from './types';
import { createPassThroughFlow, createStateMutationFlow, createTempProject } from './test-helpers';

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

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!();
  }
});

function parseJsonOutput(buffer: { stdout: string[] }): any {
  return JSON.parse(buffer.stdout.join(''));
}

describe('CLI', () => {
  it('serve 应该解析 host 和 port', async () => {
    const buffer = createIoBuffer();
    const server: StartedEngineServer = {
      host: '127.0.0.1',
      port: 4000,
      url: 'http://127.0.0.1:4000',
      close: vi.fn().mockResolvedValue(undefined),
    };
    const startServer = vi.fn().mockResolvedValue(server);
    const waitForShutdown = vi.fn().mockResolvedValue(undefined);

    const exitCode = await runCli(['serve', '.', '--host', '127.0.0.1', '--port', '4000'], {
      cwd: '/project',
      io: buffer.io,
      createRuntime: vi.fn().mockResolvedValue({}),
      startServer,
      waitForShutdown,
    });

    expect(exitCode).toBe(0);
    expect(startServer).toHaveBeenCalledWith({
      runtime: {},
      host: '127.0.0.1',
      port: 4000,
    });
    expect(waitForShutdown).toHaveBeenCalled();
    expect(buffer.stdout.join('')).toContain('http://127.0.0.1:4000');
  });

  it('未知命令应该返回错误', async () => {
    const buffer = createIoBuffer();
    const exitCode = await runCli(['unknown'], {
      io: buffer.io,
      createRuntime: vi.fn(),
      startServer: vi.fn(),
      waitForShutdown: vi.fn(),
    });

    expect(exitCode).toBe(1);
    expect(buffer.stderr.join('')).toContain('CLI_UNKNOWN_COMMAND');
  });

  it('debug --start 应该启动 run 并停在第一个 prompt', async () => {
    const session = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    } as const;
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

    const stateDir = await mkdtemp(join(tmpdir(), 'kal-debug-state-'));
    cleanups.push(async () => rm(stateDir, { recursive: true, force: true }));

    const buffer = createIoBuffer();
    const exitCode = await runCli(['debug', fixture.projectRoot, '--start', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    expect(exitCode).toBe(0);
    const payload = parseJsonOutput(buffer);
    expect(payload.status).toBe('waiting_input');
    expect(payload.waiting_for).toMatchObject({
      kind: 'prompt',
      step_id: 'turn',
    });
    expect(payload.run_id).toBeTruthy();
    expect(payload.events).toHaveLength(1);
    expect(payload.state_summary.changed_values).toMatchObject({
      visited: { old: false, new: true },
    });
    expect(payload.observation).toMatchObject({
      blocking_reason: 'awaiting_input',
      current_step: {
        step_id: 'turn',
      },
      location: {
        phase: 'session',
        step_id: 'turn',
        file: 'session.json',
      },
      suggested_next_action: {
        kind: 'provide_input',
        input_required: true,
      },
    });
  });

  it('debug 在等待输入时缺少 input 应该返回 exit code 2', async () => {
    const session = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    } as const;
    const fixture = await createTempProject({
      session,
    });
    cleanups.push(fixture.cleanup);

    const stateDir = await mkdtemp(join(tmpdir(), 'kal-debug-state-'));
    cleanups.push(async () => rm(stateDir, { recursive: true, force: true }));

    let buffer = createIoBuffer();
    await runCli(['debug', fixture.projectRoot, '--start', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    buffer = createIoBuffer();
    const exitCode = await runCli(['debug', fixture.projectRoot, '--continue', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    expect(exitCode).toBe(2);
    const payload = parseJsonOutput(buffer);
    expect(payload.status).toBe('error');
    expect(payload.diagnostics[0].code).toBe('INPUT_REQUIRED');
    expect(payload.waiting_for).toMatchObject({
      kind: 'prompt',
      step_id: 'turn',
    });
    expect(payload.observation.blocking_reason).toBe('awaiting_input');
    expect(payload.observation.suggested_next_action.command).toContain('--continue <input>');
  });

  it('debug --continue 带输入时应推进到结束', async () => {
    const session = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    } as const;
    const fixture = await createTempProject({
      session,
    });
    cleanups.push(fixture.cleanup);

    const stateDir = await mkdtemp(join(tmpdir(), 'kal-debug-state-'));
    cleanups.push(async () => rm(stateDir, { recursive: true, force: true }));

    let buffer = createIoBuffer();
    await runCli(['debug', fixture.projectRoot, '--start', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    buffer = createIoBuffer();
    const exitCode = await runCli(['debug', fixture.projectRoot, '--continue', 'attack', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    expect(exitCode).toBe(0);
    const payload = parseJsonOutput(buffer);
    expect(payload.status).toBe('ended');
    expect(payload.events).toHaveLength(2);
    expect(payload.events[0]).toMatchObject({
      type: 'output',
      step_id: 'turn',
      raw: { reply: 'attack' },
    });
    expect(payload.events[1]).toEqual({
      type: 'end',
      message: 'done',
    });
    expect(payload.observation.blocking_reason).toBe('session_ended');
    expect(payload.observation.suggested_next_action).toMatchObject({
      kind: 'start_new_run',
    });
  });

  it('debug --state 默认查询当前项目 active run', async () => {
    const session = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', stateKey: 'playerName', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    } as const;
    const fixture = await createTempProject({
      flows: {
        intro: createStateMutationFlow(),
        main: createPassThroughFlow(),
      },
      initialState: {
        playerName: { type: 'string', value: 'Hero' },
        visited: { type: 'boolean', value: false },
      },
      session,
    });
    cleanups.push(fixture.cleanup);

    const stateDir = await mkdtemp(join(tmpdir(), 'kal-debug-state-'));
    cleanups.push(async () => rm(stateDir, { recursive: true, force: true }));

    let buffer = createIoBuffer();
    await runCli(['debug', fixture.projectRoot, '--start', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    buffer = createIoBuffer();
    const exitCode = await runCli(['debug', fixture.projectRoot, '--state', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    expect(exitCode).toBe(0);
    const payload = parseJsonOutput(buffer);
    expect(payload.status).toBe('waiting_input');
    expect(payload.state.visited.value).toBe(true);
    expect(payload.state.playerName.value).toBe('Hero');
    expect(payload.state_summary.preview).toMatchObject({
      playerName: 'Hero',
      visited: true,
    });
    expect(payload.observation.blocking_reason).toBe('awaiting_input');
  });

  it('debug 运行时错误应返回结构化 observation 和 diagnostics', async () => {
    const session = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'broken', type: 'Prompt', promptText: '你的行动？', stateKey: 'missing-key', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    } as const;
    const fixture = await createTempProject({
      session,
    });
    cleanups.push(fixture.cleanup);

    const stateDir = await mkdtemp(join(tmpdir(), 'kal-debug-state-'));
    cleanups.push(async () => rm(stateDir, { recursive: true, force: true }));

    let buffer = createIoBuffer();
    await runCli(['debug', fixture.projectRoot, '--start', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    buffer = createIoBuffer();
    const exitCode = await runCli(['debug', fixture.projectRoot, '--continue', 'attack', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    expect(exitCode).toBe(1);
    const payload = parseJsonOutput(buffer);
    expect(payload.status).toBe('error');
    expect(payload.run_id).toBeTruthy();
    expect(payload.observation).toMatchObject({
      blocking_reason: 'runtime_error',
      root_cause: {
        code: 'STATE_KEY_NOT_FOUND',
      },
      location: {
        phase: 'session',
        step_id: 'broken',
        file: 'session.json',
        json_path: 'steps[id=broken]',
      },
    });
    expect(payload.diagnostics[0]).toMatchObject({
      code: 'STATE_KEY_NOT_FOUND',
      root_cause: {
        code: 'STATE_KEY_NOT_FOUND',
      },
      remediation: {
        suggestions: expect.any(Array),
      },
      location: {
        phase: 'session',
        step_id: 'broken',
      },
    });
    expect(payload.observation.allowed_next_actions[0]).toMatchObject({
      kind: 'fix_files',
    });
  });

  it('自定义节点文件变化应让旧 run 失效', async () => {
    const session = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'message', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    } as const;
    const fixture = await createTempProject({
      customNodeSource: `export default {
        type: 'CustomNode',
        label: 'Custom Node',
        inputs: [],
        outputs: [],
        async execute() { return {}; }
      };`,
      session,
    });
    cleanups.push(fixture.cleanup);

    const stateDir = await mkdtemp(join(tmpdir(), 'kal-debug-state-'));
    cleanups.push(async () => rm(stateDir, { recursive: true, force: true }));

    let buffer = createIoBuffer();
    await runCli(['debug', fixture.projectRoot, '--start', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    await mkdir(join(fixture.projectRoot, 'node'), { recursive: true });
    await writeFile(join(fixture.projectRoot, 'node', 'CustomNode.ts'), `export default {
      type: 'CustomNode',
      label: 'Custom Node',
      inputs: [],
      outputs: [],
      async execute() { return { changed: true }; }
    };`, 'utf8');

    buffer = createIoBuffer();
    const exitCode = await runCli(['debug', fixture.projectRoot, '--continue', 'attack', '--state-dir', stateDir], {
      cwd: fixture.projectRoot,
      io: buffer.io,
    });

    expect(exitCode).toBe(2);
    const payload = parseJsonOutput(buffer);
    expect(payload.diagnostics[0].code).toBe('SESSION_HASH_MISMATCH');
    expect(payload.observation.blocking_reason).toBe('snapshot_invalid');
    expect(payload.next_action).toContain('--start --force-new');
  });
});
