import { resolve } from 'node:path';
import { EngineHttpError, formatEngineError } from './errors';
import { EngineRuntime } from './runtime';
import { startEngineServer } from './server';
import { startStudioServer } from './studio-server';
import { runTui } from './tui/tui';
import { ConfigCommand } from './commands/config';
import { runDebugCommand } from './commands/debug';
import { runLintCommand } from './commands/lint';
import { runSmokeCommand } from './commands/smoke';
import { runEvalCommand } from './commands/eval';
import type { EngineCliIO, StartedEngineServer } from './types';

export interface CliDependencies {
  cwd: string;
  io: EngineCliIO;
  createRuntime(projectRoot: string): Promise<EngineRuntime>;
  startServer(params: {
    runtime: EngineRuntime;
    host?: string;
    port?: number;
  }): Promise<StartedEngineServer>;
  waitForShutdown(server: StartedEngineServer, io: EngineCliIO): Promise<void>;
}

function defaultIo(): EngineCliIO {
  return {
    stdout(message: string) {
      process.stdout.write(message);
    },
    stderr(message: string) {
      process.stderr.write(message);
    },
  };
}

async function waitForShutdown(server: StartedEngineServer, io: EngineCliIO): Promise<void> {
  await new Promise<void>((resolve) => {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    const onSignal = (signal: NodeJS.Signals) => {
      for (const current of signals) {
        process.off(current, onSignal);
      }
      io.stdout(`Received ${signal}, shutting down...\n`);
      void server.close().finally(resolve);
    };

    for (const signal of signals) {
      process.on(signal, onSignal);
    }
  });
}

const defaultDependencies: CliDependencies = {
  cwd: process.cwd(),
  io: defaultIo(),
  createRuntime(projectRoot: string) {
    return EngineRuntime.create(projectRoot);
  },
  startServer: startEngineServer,
  waitForShutdown,
};

function printUsage(io: EngineCliIO): void {
  io.stderr([
    'Usage:',
    '  kal studio [project-path] [--host <host>] [--port <port>]',
    '  kal serve  [project-path] [--host <host>] [--port <port>]',
    '  kal play   [project-path]',
    '  kal debug  [project-path] --start [--force-new] [--state-dir <path>] [--format <json|pretty>]',
    '  kal debug  [project-path] --continue [input] [--run-id <id>] [--input <input>]',
    '  kal debug  [project-path] --step [input] [--run-id <id>] [--input <input>]',
    '  kal debug  [project-path] --state [--run-id <id>]',
    '  kal debug  [project-path] --list',
    '  kal debug  [project-path] --delete --run-id <id>',
    '  kal lint   [project-path] [--format <json|pretty>]',
    '  kal smoke  [project-path] [--steps N] [--input value]... [--dry-run] [--format <json|pretty>]',
    '  kal eval   render <flow> --node <id> [--state <json>] [--format <json|pretty>]',
    '  kal eval   run <flow> --node <id> [--variant <file>] [--runs N] [--input <json>] [--state <json>] [--format <json|pretty>]',
    '  kal config [command] [options]',
    '',
    'Config commands:',
    '  kal config init                    # 初始化配置文件',
    '  kal config set <key> <value>       # 设置配置项',
    '  kal config get <key>               # 获取配置项',
    '  kal config list                    # 列出所有配置',
    '  kal config set-key <provider> <key> # 安全设置 API 密钥',
  ].join('\n') + '\n');
}

function parseCommandArgs(tokens: string[]): { projectPath?: string; flags: Record<string, string> } {
  const flags: Record<string, string> = {};
  let projectPath: string | undefined;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.startsWith('--')) {
      const flag = token.slice(2);
      const value = tokens[index + 1];
      if (!value || value.startsWith('--')) {
        throw new EngineHttpError(`Missing value for flag --${flag}`, 400, 'CLI_FLAG_VALUE_REQUIRED', { flag });
      }
      flags[flag] = value;
      index += 1;
      continue;
    }

    if (projectPath) {
      throw new EngineHttpError('Only one project path is allowed', 400, 'CLI_PROJECT_PATH_CONFLICT');
    }
    projectPath = token;
  }

  return { projectPath, flags };
}

function resolveProjectPath(projectPath: string | undefined, cwd: string): string {
  return resolve(cwd, projectPath ?? '.');
}

async function serveCommand(
  tokens: string[],
  dependencies: CliDependencies
): Promise<number> {
  const { projectPath, flags } = parseCommandArgs(tokens);
  const runtime = await dependencies.createRuntime(resolveProjectPath(projectPath, dependencies.cwd));
  const host = flags.host ?? '127.0.0.1';
  const port = flags.port ? Number(flags.port) : 3000;
  if (!Number.isFinite(port) || port < 0) {
    throw new EngineHttpError('CLI port must be a non-negative number', 400, 'CLI_PORT_INVALID', { port: flags.port });
  }
  const server = await dependencies.startServer({
    runtime,
    host,
    port,
  });
  dependencies.io.stdout(`Engine server listening on ${server.url}\n`);
  await dependencies.waitForShutdown(server, dependencies.io);
  return 0;
}

async function playCommand(
  tokens: string[],
  dependencies: CliDependencies
): Promise<number> {
  const { projectPath } = parseCommandArgs(tokens);
  const runtime = await dependencies.createRuntime(resolveProjectPath(projectPath, dependencies.cwd));

  if (!runtime.hasSession()) {
    throw new EngineHttpError('项目缺少 session.json，无法启动 play 模式', 400, 'NO_SESSION');
  }

  await runTui({ runtime });
  return 0;
}

async function configCommand(
  tokens: string[],
  dependencies: CliDependencies
): Promise<number> {
  const configCmd = new ConfigCommand(dependencies.io);
  return await configCmd.execute(tokens);
}

async function studioCommand(
  tokens: string[],
  dependencies: CliDependencies
): Promise<number> {
  const { projectPath, flags } = parseCommandArgs(tokens);
  const runtime = await dependencies.createRuntime(resolveProjectPath(projectPath, dependencies.cwd));
  const host = flags.host ?? '127.0.0.1';
  const port = flags.port ? Number(flags.port) : 3000;
  if (!Number.isFinite(port) || port < 0) {
    throw new EngineHttpError('CLI port must be a non-negative number', 400, 'CLI_PORT_INVALID', { port: flags.port });
  }
  const server = await startStudioServer({ runtime, host, port });
  dependencies.io.stdout(`Studio running on ${server.url}\n`);
  await dependencies.waitForShutdown(server, dependencies.io);
  return 0;
}

export async function runCli(argv: string[], deps: Partial<CliDependencies> = {}): Promise<number> {
  const dependencies: CliDependencies = {
    ...defaultDependencies,
    ...deps,
    io: deps.io ?? defaultDependencies.io,
  };

  const [command, ...tokens] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage(dependencies.io);
    return command ? 0 : 1;
  }

  try {
    if (command === 'studio') {
      return await studioCommand(tokens, dependencies);
    }
    if (command === 'serve') {
      return await serveCommand(tokens, dependencies);
    }
    if (command === 'play') {
      return await playCommand(tokens, dependencies);
    }
    if (command === 'debug') {
      return await runDebugCommand(tokens, dependencies);
    }
    if (command === 'lint') {
      return await runLintCommand(tokens, { cwd: dependencies.cwd, io: dependencies.io });
    }
    if (command === 'smoke') {
      return await runSmokeCommand(tokens, dependencies);
    }
    if (command === 'eval') {
      return await runEvalCommand(tokens, { cwd: dependencies.cwd, io: dependencies.io, createRuntime: dependencies.createRuntime });
    }
    if (command === 'config') {
      return await configCommand(tokens, dependencies);
    }

    throw new EngineHttpError(`Unknown command: ${command}`, 400, 'CLI_UNKNOWN_COMMAND', { command });
  } catch (error) {
    dependencies.io.stderr(`${JSON.stringify(formatEngineError(error), null, 2)}\n`);
    return 1;
  }
}
