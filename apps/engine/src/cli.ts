import { defineCommand, renderUsage, runCommand } from 'citty';
import { EngineRuntime } from './runtime';
import { startEngineServer } from './server';
import { formatEngineError, EngineHttpError } from './errors';
import {
  getExitCode,
  resetCliContext,
  setCliContext,
  type CliDependencies,
} from './cli-context';
import type { EngineCliIO, StartedEngineServer } from './types';

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
  createRuntime(projectRoot, options) {
    return EngineRuntime.create(projectRoot, options);
  },
  startServer: startEngineServer,
  waitForShutdown,
};

async function resolveValue<T>(value: T | Promise<T> | (() => T) | (() => Promise<T>) | undefined): Promise<T | undefined> {
  if (typeof value === 'function') {
    return await (value as (() => T | Promise<T>))();
  }
  return await value;
}

async function resolveUsageTarget(command: any, rawArgs: string[], parent?: any): Promise<[any, any?]> {
  const subCommands = await resolveValue(command.subCommands);
  if (subCommands && Object.keys(subCommands).length > 0) {
    const subCommandArgIndex = rawArgs.findIndex((arg) => !arg.startsWith('-'));
    const subCommandName = rawArgs[subCommandArgIndex];
    if (subCommandName && subCommands[subCommandName]) {
      const subCommand = await resolveValue(subCommands[subCommandName]);
      if (subCommand) {
        return await resolveUsageTarget(subCommand, rawArgs.slice(subCommandArgIndex + 1), command);
      }
    }
  }
  return [command, parent];
}

async function writeUsage(io: EngineCliIO, rawArgs: string[], stream: 'stdout' | 'stderr' = 'stderr'): Promise<void> {
  const [target, parent] = await resolveUsageTarget(main, rawArgs);
  io[stream](`${await renderUsage(target, parent)}\n`);
}

function isCliError(error: unknown): error is Error & { code?: string } {
  return error instanceof Error && 'code' in error;
}

const main = defineCommand({
  meta: {
    name: 'kal',
    version: '0.1.0',
    description: 'KAL-AI Engine CLI',
  },
  subCommands: {
    studio: () => import('./commands/studio').then((module) => module.default),
    serve: () => import('./commands/serve').then((module) => module.default),
    play: () => import('./commands/play').then((module) => module.default),
    debug: () => import('./commands/debug/index').then((module) => module.default),
    lint: () => import('./commands/lint').then((module) => module.default),
    smoke: () => import('./commands/smoke').then((module) => module.default),
    eval: () => import('./commands/eval/index').then((module) => module.default),
    init: () => import('./commands/init').then((module) => module.default),
    schema: () => import('./commands/schema/index').then((module) => module.default),
    config: () => import('./commands/config/index').then((module) => module.default),
    session: () => import('./commands/session/index').then((module) => module.default),
    flow: () => import('./commands/flow/index').then((module) => module.default),
  },
});

export type { CliDependencies } from './cli-context';

export async function runCli(argv: string[], deps: Partial<CliDependencies> = {}): Promise<number> {
  const dependencies: CliDependencies = {
    ...defaultDependencies,
    ...deps,
    io: deps.io ?? defaultDependencies.io,
  };

  if (argv.length === 0) {
    await writeUsage(dependencies.io, argv);
    return 1;
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    await writeUsage(dependencies.io, argv, 'stdout');
    return 0;
  }

  if (argv.length === 1 && argv[0] === '--version') {
    dependencies.io.stdout('0.1.0\n');
    return 0;
  }

  setCliContext(dependencies);

  try {
    await runCommand(main, { rawArgs: argv });
    return getExitCode();
  } catch (error) {
    if (isCliError(error)) {
      if (error.code === 'E_NO_COMMAND' || error.code === 'EARG') {
        dependencies.io.stderr(`${error.message}\n`);
        await writeUsage(dependencies.io, argv);
        return 2;
      }

      if (error.code === 'E_UNKNOWN_COMMAND') {
        const rootCommands = Object.keys((await resolveValue(main.subCommands)) ?? {});
        const first = argv.find((token) => !token.startsWith('-')) ?? '';
        if (!rootCommands.includes(first)) {
          const mapped = new EngineHttpError(`Unknown command: ${first}`, 400, 'CLI_UNKNOWN_COMMAND', { command: first });
          dependencies.io.stderr(`${JSON.stringify(formatEngineError(mapped), null, 2)}\n`);
          return 1;
        }
        dependencies.io.stderr(`${error.message}\n`);
        await writeUsage(dependencies.io, argv);
        return 2;
      }
    }

    dependencies.io.stderr(`${JSON.stringify(formatEngineError(error), null, 2)}\n`);
    return 1;
  } finally {
    resetCliContext();
  }
}
