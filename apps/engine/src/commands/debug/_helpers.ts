import { getCliContext, setExitCode } from '../../cli-context';
import { runDebugCommand } from './_debug-core.js';

export { runDebugCommand };

export interface DebugLeafArgs {
  projectPath?: string;
  runId?: string;
  diffRunId?: string;
  input?: string;
  stateDir?: string;
  format?: string;
  latest?: boolean;
  forceNew?: boolean;
}

function pushCommonTokens(tokens: string[], args: DebugLeafArgs): void {
  if (args.projectPath) {
    tokens.push(args.projectPath);
  }
  if (args.runId) {
    tokens.push('--run-id', args.runId);
  }
  if (args.diffRunId) {
    tokens.push('--diff-run', args.diffRunId);
  }
  if (args.input) {
    tokens.push('--input', args.input);
  }
  if (args.stateDir) {
    tokens.push('--state-dir', args.stateDir);
  }
  if (args.format) {
    tokens.push('--format', args.format);
  }
  if (args.latest === true) {
    tokens.push('--latest');
  }
  if (args.forceNew === true) {
    tokens.push('--force-new');
  }
}

export async function runLegacyDebug(actionFlag: string, args: DebugLeafArgs = {}): Promise<void> {
  const { cwd, io, createRuntime } = getCliContext();
  const tokens: string[] = [];
  pushCommonTokens(tokens, { projectPath: args.projectPath });
  tokens.push(actionFlag);
  pushCommonTokens(tokens, {
    runId: args.runId,
    diffRunId: args.diffRunId,
    input: args.input,
    stateDir: args.stateDir,
    format: args.format,
    latest: args.latest,
    forceNew: args.forceNew,
  });
  setExitCode(await runDebugCommand(tokens, { cwd, io, createRuntime }));
}
