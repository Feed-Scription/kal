import { describe, expect, it, vi } from 'vitest';
import { runCli } from './cli';
import type { EngineCliIO, StartedEngineServer } from './types';

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
});
