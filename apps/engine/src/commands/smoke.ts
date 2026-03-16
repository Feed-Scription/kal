import {
  advanceSession,
  createSessionCursor,
  inspectCurrentSessionStep,
  previewAdvanceSession,
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

export interface SmokeStepResult {
  step: number;
  stepId: string | null;
  status: string;
  waitingFor?: { kind: string; promptText?: string; options?: Array<{ label: string; value: string }> };
  inputProvided?: string;
  stateChanges?: Record<string, { before: any; after: any }>;
  error?: { code: string; message: string };
}

export interface SmokeResult {
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
    const smokeResult = await collectSmokePayload(runtime, {
      steps: parsed.steps,
      inputs: parsed.inputs,
      dryRun: parsed.dryRun,
    });

    if (parsed.format === 'pretty') {
      writePretty(dependencies.io, smokeResult);
    } else {
      dependencies.io.stdout(JSON.stringify(smokeResult, null, 2) + '\n');
    }

    return smokeResult.finalStatus === 'error' ? 1 : 0;
  } catch (error) {
    dependencies.io.stderr(`Error: ${(error as Error).message}\n`);
    return 1;
  }
}

export async function collectSmokePayload(
  runtime: EngineRuntime,
  options: {
    steps?: number;
    inputs?: string[];
    dryRun?: boolean;
  } = {},
): Promise<SmokeResult> {
  if (!runtime.hasSession()) {
    throw new Error('Project has no session.json');
  }

  const session = runtime.getSession()!;
  const totalSteps = options.steps ?? 10;
  const inputs = [...(options.inputs ?? [])];
  const dryRun = Boolean(options.dryRun);
  let cursor: SessionCursor = createSessionCursor(session);
  let inputIndex = 0;
  const stepResults: SmokeStepResult[] = [];
  let completedSteps = 0;
  let finalStatus = 'running';
  let dryRunState = runtime.getState();

  for (let step = 0; step < totalSteps; step++) {
    const stateBefore = dryRun ? dryRunState : runtime.getState();
    let userInput: string | undefined;
    const inspection = inspectCurrentSessionStep(session, cursor, stateBefore);

    if (inspection.status === 'error') {
      stepResults.push({
        step,
        stepId: cursor.currentStepId,
        status: 'error',
        error: inspection.diagnostic
          ? {
              code: inspection.diagnostic.code,
              message: inspection.diagnostic.message,
            }
          : undefined,
      });
      finalStatus = 'error';
      completedSteps = step + 1;
      break;
    }

    if (inspection.status === 'waiting_input') {
      if (inputIndex < inputs.length) {
        userInput = inputs[inputIndex++];
      } else if (inspection.waitingFor?.kind === 'choice' && inspection.waitingFor.options?.length) {
        userInput = inspection.waitingFor.options[0]!.value;
      } else {
        stepResults.push({
          step,
          stepId: cursor.currentStepId,
          status: 'waiting_input',
          waitingFor: inspection.waitingFor
            ? {
                kind: inspection.waitingFor.kind,
                promptText: inspection.waitingFor.promptText,
                options: inspection.waitingFor.options,
              }
            : undefined,
        });
        finalStatus = 'waiting_input';
        completedSteps = step;
        break;
      }

      if (dryRun) {
        const previewResult = previewAdvanceSession(session, cursor, dryRunState, {
          mode: 'step',
          userInput,
        });

        stepResults.push({
          step,
          stepId: cursor.currentStepId,
          status: previewResult.status === 'error' ? 'error' : 'dry_run_input',
          waitingFor: inspection.waitingFor
            ? {
                kind: inspection.waitingFor.kind,
                promptText: inspection.waitingFor.promptText,
                options: inspection.waitingFor.options,
              }
            : undefined,
          inputProvided: userInput,
          error: previewResult.diagnostic
            ? {
                code: previewResult.diagnostic.code,
                message: previewResult.diagnostic.message,
              }
            : undefined,
        });

        cursor = previewResult.cursor;
        dryRunState = previewResult.stateAfter;
        completedSteps = step + 1;

        if (previewResult.status === 'ended') {
          finalStatus = 'ended';
          break;
        }
        if (previewResult.status === 'error') {
          finalStatus = 'error';
          break;
        }
        continue;
      }

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
    } else {
      if (dryRun) {
        const previewResult = previewAdvanceSession(session, cursor, dryRunState, { mode: 'step' });

        stepResults.push({
          step,
          stepId: cursor.currentStepId,
          status:
            previewResult.status === 'ended'
              ? 'ended'
              : previewResult.status === 'error'
                ? 'error'
                : 'dry_run_step',
          error: previewResult.diagnostic
            ? {
                code: previewResult.diagnostic.code,
                message: previewResult.diagnostic.message,
              }
            : undefined,
        });

        cursor = previewResult.cursor;
        dryRunState = previewResult.stateAfter;
        completedSteps = step + 1;

        if (previewResult.status === 'ended') {
          finalStatus = 'ended';
          break;
        }
        if (previewResult.status === 'error') {
          finalStatus = 'error';
          break;
        }
        continue;
      }

      const result = await advanceSession(
        session,
        {
          executeFlow: (flowId, inputData) => runtime.executeFlow(flowId, inputData ?? {}),
          getState: () => runtime.getState(),
          setState: (key, value) => runtime.setState(key, value),
        },
        cursor,
        { mode: 'step' },
      );

      stepResults.push({
        step,
        stepId: cursor.currentStepId,
        status: result.status,
        stateChanges: diffState(stateBefore, runtime.getState()),
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
    }
  }

  if (finalStatus === 'running') {
    finalStatus = completedSteps >= totalSteps ? 'max_steps_reached' : 'running';
  }

  const smokeResult: SmokeResult = {
    project: runtime.getProject().projectRoot,
    totalSteps,
    completedSteps,
    finalStatus,
    dryRun,
    steps: stepResults,
  };

  if (!dryRun) {
    const finalState = runtime.getState();
    const simplifiedState: Record<string, any> = {};
    for (const [key, sv] of Object.entries(finalState)) {
      simplifiedState[key] = sv.value;
    }
    smokeResult.finalState = simplifiedState;
  }

  return smokeResult;
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
