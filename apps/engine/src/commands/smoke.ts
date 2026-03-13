import {
  advanceSession,
  createSessionCursor,
  type SessionAdvanceResult,
  type SessionCursor,
  type StateValue,
} from '@kal-ai/core';
import { resolve } from 'node:path';
import type { EngineCliIO } from '../types';
import type { EngineRuntime } from '../runtime';

interface SmokeCommandDependencies {
  cwd: string;
  io: EngineCliIO;
  createRuntime(projectRoot: string): Promise<EngineRuntime>;
}

interface ParsedSmokeArgs {
  projectPath?: string;
  steps: number;
  inputs: string[];
  dryRun: boolean;
  format: 'json' | 'pretty';
}

interface SmokeStepResult {
  step: number;
  stepId: string | null;
  status: string;
  waitingFor?: { kind: string; promptText?: string; options?: Array<{ label: string; value: string }> };
  inputProvided?: string;
  stateChanges?: Record<string, { before: any; after: any }>;
  error?: { code: string; message: string };
}

interface SmokeResult {
  project: string;
  totalSteps: number;
  completedSteps: number;
  finalStatus: string;
  dryRun: boolean;
  steps: SmokeStepResult[];
  finalState?: Record<string, any>;
}

function parseSmokeArgs(tokens: string[]): ParsedSmokeArgs {
  let projectPath: string | undefined;
  let steps = 10;
  const inputs: string[] = [];
  let dryRun = false;
  let format: 'json' | 'pretty' = 'json';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token === '--steps' || token === '-n') {
      const val = tokens[++i];
      if (!val) throw new Error('--steps requires a number');
      steps = parseInt(val, 10);
      if (!Number.isFinite(steps) || steps < 1) throw new Error('--steps must be a positive integer');
      continue;
    }

    if (token === '--input' || token === '-i') {
      const val = tokens[++i];
      if (!val) throw new Error('--input requires a value');
      inputs.push(val);
      continue;
    }

    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (token === '--format') {
      const val = tokens[++i];
      if (val !== 'json' && val !== 'pretty') throw new Error('--format must be json or pretty');
      format = val;
      continue;
    }

    if (token.startsWith('--')) {
      throw new Error(`Unknown flag: ${token}`);
    }

    if (!projectPath) {
      projectPath = token;
    } else {
      throw new Error('Only one project path is allowed');
    }
  }

  return { projectPath, steps, inputs, dryRun, format };
}

function diffState(
  before: Record<string, StateValue>,
  after: Record<string, StateValue>,
): Record<string, { before: any; after: any }> | undefined {
  const changes: Record<string, { before: any; after: any }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const bVal = before[key]?.value;
    const aVal = after[key]?.value;
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      changes[key] = { before: bVal, after: aVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

export async function runSmokeCommand(
  tokens: string[],
  dependencies: SmokeCommandDependencies,
): Promise<number> {
  let parsed: ParsedSmokeArgs;
  try {
    parsed = parseSmokeArgs(tokens);
  } catch (error) {
    dependencies.io.stderr(`Error: ${(error as Error).message}\n`);
    dependencies.io.stderr('Usage: kal smoke [project-path] [--steps N] [--input value]... [--dry-run] [--format json|pretty]\n');
    return 2;
  }

  const projectRoot = resolve(dependencies.cwd, parsed.projectPath ?? '.');

  try {
    const runtime = await dependencies.createRuntime(projectRoot);

    if (!runtime.hasSession()) {
      dependencies.io.stderr('Error: Project has no session.json\n');
      return 1;
    }

    const session = runtime.getSession()!;
    let cursor: SessionCursor = createSessionCursor(session);
    let inputIndex = 0;
    const stepResults: SmokeStepResult[] = [];
    let completedSteps = 0;
    let finalStatus = 'running';

    for (let step = 0; step < parsed.steps; step++) {
      const stateBefore = runtime.getState();

      // Check if we need input
      let userInput: string | undefined;

      // Do a dry probe first to see if input is needed
      const probeResult: SessionAdvanceResult = await advanceSession(
        session,
        {
          executeFlow: (flowId, inputData) => runtime.executeFlow(flowId, inputData ?? {}),
          getState: () => runtime.getState(),
          setState: (key, value) => runtime.setState(key, value),
        },
        cursor,
        { mode: 'step' },
      );

      if (probeResult.status === 'waiting_input') {
        if (inputIndex < parsed.inputs.length) {
          userInput = parsed.inputs[inputIndex++];
        } else if (probeResult.waitingFor?.kind === 'choice' && probeResult.waitingFor.options?.length) {
          // Auto-select first option
          userInput = probeResult.waitingFor.options[0]!.value;
        } else {
          // No more inputs available, record and stop
          stepResults.push({
            step,
            stepId: cursor.currentStepId,
            status: 'waiting_input',
            waitingFor: probeResult.waitingFor ? {
              kind: probeResult.waitingFor.kind,
              promptText: probeResult.waitingFor.promptText,
              options: probeResult.waitingFor.options,
            } : undefined,
          });
          finalStatus = 'waiting_input';
          completedSteps = step;
          break;
        }

        if (parsed.dryRun) {
          stepResults.push({
            step,
            stepId: cursor.currentStepId,
            status: 'dry_run_input',
            waitingFor: probeResult.waitingFor ? {
              kind: probeResult.waitingFor.kind,
              promptText: probeResult.waitingFor.promptText,
              options: probeResult.waitingFor.options,
            } : undefined,
            inputProvided: userInput,
          });
          completedSteps = step + 1;
          continue;
        }

        // Actually advance with input
        const result = await advanceSession(
          session,
          {
            executeFlow: (flowId, inputData) => runtime.executeFlow(flowId, inputData ?? {}),
            getState: () => runtime.getState(),
            setState: (key, value) => runtime.setState(key, value),
          },
          cursor,
          { mode: 'step', userInput },
        );

        const stateAfter = runtime.getState();
        const stateChanges = diffState(stateBefore, stateAfter);

        stepResults.push({
          step,
          stepId: cursor.currentStepId,
          status: result.status,
          inputProvided: userInput,
          stateChanges,
          error: result.diagnostic ? { code: result.diagnostic.code, message: result.diagnostic.message } : undefined,
        });

        cursor = result.cursor;
        completedSteps = step + 1;

        if (result.status === 'ended') {
          finalStatus = 'ended';
          break;
        }
        if (result.status === 'error') {
          finalStatus = 'error';
          break;
        }
      } else if (probeResult.status === 'ended') {
        stepResults.push({
          step,
          stepId: cursor.currentStepId,
          status: 'ended',
        });
        finalStatus = 'ended';
        completedSteps = step + 1;
        cursor = probeResult.cursor;
        break;
      } else if (probeResult.status === 'error') {
        stepResults.push({
          step,
          stepId: cursor.currentStepId,
          status: 'error',
          error: probeResult.diagnostic ? { code: probeResult.diagnostic.code, message: probeResult.diagnostic.message } : undefined,
        });
        finalStatus = 'error';
        completedSteps = step + 1;
        break;
      } else {
        // paused — step executed successfully without needing input
        const stateAfter = runtime.getState();
        const stateChanges = diffState(stateBefore, stateAfter);

        stepResults.push({
          step,
          stepId: cursor.currentStepId,
          status: probeResult.status,
          stateChanges,
        });

        cursor = probeResult.cursor;
        completedSteps = step + 1;
      }
    }

    if (finalStatus === 'running') {
      finalStatus = completedSteps >= parsed.steps ? 'max_steps_reached' : 'running';
    }

    const smokeResult: SmokeResult = {
      project: projectRoot,
      totalSteps: parsed.steps,
      completedSteps,
      finalStatus,
      dryRun: parsed.dryRun,
      steps: stepResults,
    };

    if (!parsed.dryRun) {
      const finalState = runtime.getState();
      const simplifiedState: Record<string, any> = {};
      for (const [key, sv] of Object.entries(finalState)) {
        simplifiedState[key] = sv.value;
      }
      smokeResult.finalState = simplifiedState;
    }

    if (parsed.format === 'pretty') {
      writePretty(dependencies.io, smokeResult);
    } else {
      dependencies.io.stdout(JSON.stringify(smokeResult, null, 2) + '\n');
    }

    return finalStatus === 'error' ? 1 : 0;
  } catch (error) {
    dependencies.io.stderr(`Error: ${(error as Error).message}\n`);
    return 1;
  }
}

function writePretty(io: EngineCliIO, result: SmokeResult): void {
  io.stdout(`Smoke test: ${result.project}\n`);
  io.stdout(`Steps: ${result.completedSteps}/${result.totalSteps} | Status: ${result.finalStatus}${result.dryRun ? ' (dry-run)' : ''}\n`);
  io.stdout('---\n');

  for (const step of result.steps) {
    let line = `[${step.step}] ${step.stepId ?? '(null)'} → ${step.status}`;
    if (step.inputProvided) {
      line += ` (input: "${step.inputProvided}")`;
    }
    if (step.error) {
      line += ` ERROR: ${step.error.code} - ${step.error.message}`;
    }
    io.stdout(line + '\n');

    if (step.stateChanges) {
      for (const [key, change] of Object.entries(step.stateChanges)) {
        io.stdout(`  ${key}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}\n`);
      }
    }
  }
}
