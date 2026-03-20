import type { EngineRuntime, EngineRuntimeOptions } from './runtime';
import type { EngineCliIO, StartedEngineServer } from './types';

export interface CliDependencies {
  cwd: string;
  io: EngineCliIO;
  createRuntime(projectRoot: string, options?: EngineRuntimeOptions): Promise<EngineRuntime>;
  startServer(params: {
    runtime: EngineRuntime;
    host?: string;
    port?: number;
  }): Promise<StartedEngineServer>;
  waitForShutdown(server: StartedEngineServer, io: EngineCliIO): Promise<void>;
}

let cliContext: CliDependencies | null = null;
let exitCode = 0;

export function setCliContext(dependencies: CliDependencies): void {
  cliContext = dependencies;
  exitCode = 0;
}

export function resetCliContext(): void {
  cliContext = null;
  exitCode = 0;
}

export function getCliContext(): CliDependencies {
  if (!cliContext) {
    throw new Error('CLI context has not been initialized');
  }
  return cliContext;
}

export function setExitCode(code: number): void {
  exitCode = code;
}

export function getExitCode(): number {
  return exitCode;
}
