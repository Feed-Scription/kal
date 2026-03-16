import {
  advanceSession,
  type SessionAdvanceMode,
  type SessionAdvanceResult,
  type SessionTraceEvent,
  type SessionWaitingFor,
  type StateValue,
  type LLMRequestEvent,
  type LLMResponseEvent,
} from '@kal-ai/core';
import { resolve } from 'node:path';
import { buildCliDiagnostic, buildDebugDiagnostic } from '../debug/diagnostic-builder';
import { DebugSessionManager } from '../debug/session-manager';
import type {
  DebugActionDescriptor,
  DebugAdvancePayload,
  DebugDeletePayload,
  DebugEvent,
  DebugListPayload,
  DebugObservation,
  DebugOutputEvent,
  DebugRunSnapshot,
  DebugStateSummary,
  DebugStatePayload,
  DebugWaitingForPayload,
  DiagnosticPayload,
} from '../debug/types';
import { formatEngineError, EngineHttpError } from '../errors';
import { RunManager } from '../run-manager';
import { buildRunStateSummary, createRunnerDeps, toRunEvent, toRunWaitingFor } from '../run-views';
import type { EngineCliIO } from '../types';
import type { EngineRuntime } from '../runtime';

interface DebugCommandDependencies {
  cwd: string;
  io: EngineCliIO;
  createRuntime(projectRoot: string): Promise<EngineRuntime>;
}

type DebugAction = 'start' | 'continue' | 'step' | 'state' | 'list' | 'delete' | 'retry' | 'skip';

interface ParsedDebugArgs {
  action: DebugAction;
  projectPath?: string;
  runId?: string;
  input?: string;
  inputs?: string[];
  stateDir?: string;
  format: 'json' | 'pretty' | 'agent';
  verbose: boolean;
  cleanup: boolean;
  forceNew: boolean;
  latest: boolean;
}

interface CommandResult {
  exitCode: number;
  payload: unknown;
}

export async function runDebugCommand(
  tokens: string[],
  dependencies: DebugCommandDependencies,
): Promise<number> {
  let parsed: ParsedDebugArgs;
  try {
    parsed = parseDebugArgs(tokens);
  } catch (error) {
    // Handle --help flag
    if (error instanceof EngineHttpError && error.code === 'DEBUG_HELP_REQUESTED') {
      dependencies.io.stdout(
        'Usage:\n' +
        '  kal debug [project-path] --start [--force-new] [--state-dir <path>] [--format <json|pretty>]\n' +
        '  kal debug [project-path] --continue [input] [--run-id <id>] [--input <input>] [--latest]\n' +
        '  kal debug [project-path] --step [input] [--run-id <id>] [--input <input>] [--latest]\n' +
        '  kal debug [project-path] --state [--run-id <id>] [--latest]\n' +
        '  kal debug [project-path] --list\n' +
        '  kal debug [project-path] --delete --run-id <id>\n' +
        '\nFlags:\n' +
        '  --latest    Auto-select the most recent debug run (instead of --run-id)\n'
      );
      return 0;
    }
    return writeResult(dependencies.io, {
      exitCode: 2,
      payload: buildErrorAdvancePayload(resolveProjectRoot(undefined, dependencies.cwd), {
        diagnostics: [
          buildCliDiagnostic({
            code: error instanceof EngineHttpError ? error.code : 'DEBUG_INVALID_ARGS',
            message: error instanceof Error ? error.message : String(error),
            suggestions: [
              '检查命令参数组合是否正确',
              '运行 `kal help` 查看 debug 命令用法',
            ],
          }),
        ],
      }),
    }, 'json');
  }

  const projectRoot = resolveProjectRoot(parsed.projectPath, dependencies.cwd);
  const manager = new DebugSessionManager(parsed.stateDir ?? resolve(projectRoot, '.kal', 'runs'));
  const runManager = new RunManager({
    projectRoot,
    createRuntime: () => dependencies.createRuntime(projectRoot),
    store: manager,
  });

  try {
    let result: CommandResult;
    switch (parsed.action) {
      case 'list':
        result = await listRuns(projectRoot, runManager);
        break;
      case 'delete':
        result = await deleteRun(projectRoot, parsed.runId!, runManager);
        break;
      case 'state':
        result = await getState(projectRoot, parsed.runId, parsed.verbose, runManager, parsed.latest);
        break;
      case 'start':
        result = await startRun(projectRoot, parsed, runManager);
        break;
      case 'continue':
      case 'step':
        result = await advanceExistingRun(projectRoot, parsed, manager, runManager, dependencies);
        break;
      case 'retry':
        result = await retryCurrentStep(projectRoot, parsed, manager, runManager, dependencies);
        break;
      case 'skip':
        result = await skipCurrentStep(projectRoot, parsed, manager, runManager, dependencies);
        break;
    }

    return writeResult(dependencies.io, result, parsed.format);
  } catch (error) {
    const formatted = formatEngineError(error);
    const diagnostic = buildCliDiagnostic({
      code: formatted.code,
      message: formatted.message,
      suggestions: ['修复当前错误后重新运行调试命令'],
      details: formatted.details,
      file: formatted.code === 'NO_SESSION' ? 'session.json' : undefined,
      jsonPath: formatted.code === 'NO_SESSION' ? '' : undefined,
    });
    return writeResult(
      dependencies.io,
      {
        exitCode: 1,
        payload: buildErrorAdvancePayload(projectRoot, {
          diagnostics: [diagnostic],
        }),
      },
      parsed.format,
    );
  }
}

async function listRuns(projectRoot: string, runManager: RunManager): Promise<CommandResult> {
  const runs = await runManager.listRuns();
  const payload: DebugListPayload = {
    project_root: projectRoot,
    runs,
  };
  return { exitCode: 0, payload };
}

async function deleteRun(
  projectRoot: string,
  runId: string,
  runManager: RunManager,
): Promise<CommandResult> {
  try {
    await runManager.deleteRun(runId);
  } catch (error) {
    if (error instanceof EngineHttpError) {
      return buildCommandResultFromRunError(projectRoot, error, 2);
    }
    throw error;
  }

  const payload: DebugDeletePayload = {
    deleted: true,
    run_id: runId,
  };
  return { exitCode: 0, payload };
}

async function getState(
  projectRoot: string,
  runId: string | undefined,
  verbose: boolean,
  runManager: RunManager,
  latest = false,
): Promise<CommandResult> {
  let snapshot: DebugRunSnapshot;
  try {
    snapshot = await runManager.readSnapshot({ runId, latest });
  } catch (error) {
    if (error instanceof EngineHttpError) {
      return buildCommandResultFromRunError(projectRoot, error, 2);
    }
    throw error;
  }

  const stateSummary = buildStateSummary(snapshot.stateSnapshot);
  const payload: DebugStatePayload = {
    run_id: snapshot.runId,
    status: snapshot.status,
    waiting_for: toOutputWaitingFor(snapshot.waitingFor),
    state: snapshot.stateSnapshot,
    state_summary: stateSummary,
    cursor: snapshot.cursor,
    observation: buildObservation({
      projectRoot,
      runId: snapshot.runId,
      status: snapshot.status,
      waitingFor: toOutputWaitingFor(snapshot.waitingFor),
      currentStepId: snapshot.cursor.currentStepId,
      currentStepIndex: snapshot.cursor.stepIndex,
      diagnostics: [],
      stateSummary,
    }),
    updated_at: snapshot.updatedAt,
    ...(verbose ? { input_history: snapshot.inputHistory } : {}),
  };
  return { exitCode: 0, payload };
}

async function startRun(
  projectRoot: string,
  parsed: ParsedDebugArgs,
  runManager: RunManager,
): Promise<CommandResult> {
  try {
    let llmTraces: LLMTrace[] | undefined;
    const created = await runManager.createRun({
      forceNew: parsed.forceNew,
      cleanup: parsed.cleanup,
      mode: 'continue',
      onRuntimeCreated: parsed.verbose ? (rt) => { llmTraces = registerLLMTraceHooks(rt); } : undefined,
    });
    const diagnostics = await buildDiagnosticsFromResult(created.runtime, created.result, parsed.verbose, undefined);
    return {
      exitCode: created.result.status === 'error' ? 1 : 0,
      payload: buildAdvancePayload(
        projectRoot,
        created.snapshot.runId,
        created.result,
        diagnostics,
        created.beforeState,
        created.afterState,
        llmTraces,
      ),
    };
  } catch (error) {
    if (error instanceof EngineHttpError) {
      return buildCommandResultFromRunError(projectRoot, error, 2);
    }
    throw error;
  }
}

function buildCommandResultFromRunError(
  projectRoot: string,
  error: EngineHttpError,
  exitCode: number,
  action?: 'continue' | 'step',
): CommandResult {
  const details = (error.details && typeof error.details === 'object')
    ? error.details as Record<string, unknown>
    : {};
  const runId = typeof details.runId === 'string' ? details.runId : undefined;
  const waitingFor = normalizeWaitingFor(details.waitingFor);
  const currentStepId = typeof details.currentStepId === 'string' ? details.currentStepId : undefined;
  const currentStepIndex = typeof details.currentStepIndex === 'number' ? details.currentStepIndex : undefined;
  const stateSummary = normalizeStateSummary(details.stateSummary);

  return {
    exitCode,
    payload: buildErrorAdvancePayload(projectRoot, {
      runId,
      waitingFor,
      currentStepId,
      currentStepIndex,
      stateSummary,
      diagnostics: [
        buildCliDiagnostic({
          code: error.code,
          message: error.message,
          suggestions: suggestionsForRunError(error.code, runId, action),
          details: error.details,
        }),
      ],
      preferredAction: preferredActionForRunError(projectRoot, error.code, action),
    }),
  };
}

function normalizeWaitingFor(value: unknown): DebugWaitingForPayload | null | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.kind !== 'string' || typeof payload.step_id !== 'string') {
    return undefined;
  }

  return {
    kind: payload.kind as DebugWaitingForPayload['kind'],
    step_id: payload.step_id,
    prompt_text: typeof payload.prompt_text === 'string' ? payload.prompt_text : undefined,
    options: Array.isArray(payload.options)
      ? payload.options as Array<{ label: string; value: string }>
      : undefined,
  };
}

function normalizeStateSummary(value: unknown): DebugStateSummary | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const summary = value as Record<string, unknown>;
  if (!Array.isArray(summary.keys) || !Array.isArray(summary.changed) || typeof summary.total_keys !== 'number') {
    return undefined;
  }

  return {
    total_keys: summary.total_keys,
    keys: summary.keys as string[],
    changed: summary.changed as string[],
    changed_values: (summary.changed_values ?? {}) as Record<string, { old: any; new: any }>,
    preview: (summary.preview ?? {}) as Record<string, any>,
  };
}

function preferredActionForRunError(
  projectRoot: string,
  code: string,
  action?: 'continue' | 'step',
): DebugActionDescriptor | undefined {
  if (code === 'INPUT_REQUIRED' && action) {
    return {
      kind: action === 'step' ? 'step' : 'provide_input',
      command: `kal debug ${projectRoot} --${action} <input>`,
      description: action === 'step'
        ? 'Provide the requested input and stop after one step.'
        : 'Provide the requested input and continue until the next boundary.',
      input_required: true,
    };
  }

  return undefined;
}

function suggestionsForRunError(
  code: string,
  runId?: string,
  action?: 'continue' | 'step',
): string[] {
  switch (code) {
    case 'ACTIVE_RUN_EXISTS':
      return [
        '运行 `kal debug <project> --continue` 继续当前 run',
        '运行 `kal debug <project> --delete --run-id <id>` 删除旧 run',
        '或使用 `kal debug <project> --start --force-new` 创建新 run',
      ];
    case 'INPUT_REQUIRED':
      return [
        `运行 \`kal debug <project> --${action ?? 'continue'} <input>\` 提供输入`,
        '必要时运行 `kal debug <project> --state` 查看当前状态',
      ];
    case 'INPUT_NOT_EXPECTED':
      return [
        `运行 \`kal debug <project> --${action ?? 'continue'}\` 继续执行`,
        '必要时运行 `kal debug <project> --state` 查看当前 cursor',
      ];
    case 'SESSION_HASH_MISMATCH':
      return [
        '运行 `kal debug <project> --start --force-new` 创建新 run',
        ...(runId ? [`如需清理旧快照，运行 \`kal debug <project> --delete --run-id ${runId}\``] : []),
      ];
    case 'RUN_NOT_ACTIVE':
      return [
        '运行 `kal debug <project> --start --force-new` 创建新 run',
        '如需查看旧状态，使用 `kal debug <project> --state --run-id <id>`',
      ];
    case 'RUN_NOT_FOUND':
      return [
        '运行 `kal debug <project> --list` 查看可用 run',
        '确认当前 project path 与 run 所属项目一致',
      ];
    case 'NO_ACTIVE_RUN':
      return [
        '运行 `kal debug <project> --start` 创建新 run',
        '或使用 `kal debug <project> --list` 查看已有 runs',
      ];
    default:
      return ['修复当前错误后重新运行调试命令'];
  }
}

async function advanceExistingRun(
  projectRoot: string,
  parsed: ParsedDebugArgs,
  manager: DebugSessionManager,
  runManager: RunManager,
  dependencies: DebugCommandDependencies,
): Promise<CommandResult> {
  let snapshot: DebugRunSnapshot;
  try {
    snapshot = await runManager.readSnapshot({ runId: parsed.runId, latest: parsed.latest });
  } catch (error) {
    if (error instanceof EngineHttpError) {
      return buildCommandResultFromRunError(projectRoot, error, 2);
    }
    throw error;
  }

  // Multi-step mode: --inputs "explore,explore,sleep"
  if (parsed.inputs) {
    const runtime = await dependencies.createRuntime(projectRoot);
    if (!runtime.hasSession()) {
      throw new EngineHttpError('项目缺少 session.json，无法恢复 debug 模式', 400, 'NO_SESSION');
    }
    runtime.restoreState(snapshot.stateSnapshot);
    return advanceMultiStep(projectRoot, snapshot, parsed, runtime, manager);
  }

  try {
    let llmTraces: LLMTrace[] | undefined;
    const advanced = await runManager.advanceRun({
      runId: parsed.runId,
      latest: parsed.latest,
      input: parsed.input,
      cleanup: parsed.cleanup,
      mode: parsed.action as SessionAdvanceMode,
      onRuntimeCreated: parsed.verbose ? (rt) => { llmTraces = registerLLMTraceHooks(rt); } : undefined,
    });
    const diagnostics = await buildDiagnosticsFromResult(advanced.runtime, advanced.result, parsed.verbose, parsed.input);
    return {
      exitCode: advanced.result.status === 'error' ? 1 : 0,
      payload: buildAdvancePayload(
        projectRoot,
        advanced.snapshot.runId,
        advanced.result,
        diagnostics,
        advanced.beforeState,
        advanced.afterState,
        llmTraces,
      ),
    };
  } catch (error) {
    if (error instanceof EngineHttpError) {
      return buildCommandResultFromRunError(projectRoot, error, 2, parsed.action as 'continue' | 'step');
    }
    throw error;
  }
}

async function advanceMultiStep(
  projectRoot: string,
  snapshot: DebugRunSnapshot,
  parsed: ParsedDebugArgs,
  runtime: EngineRuntime,
  manager: DebugSessionManager,
): Promise<CommandResult> {
  const inputQueue = [...parsed.inputs!];
  const session = runtime.getSession()!;
  const deps = createRunnerDeps(runtime);
  const beforeState = runtime.getState();

  let cursor = snapshot.cursor;
  let currentSnapshot = snapshot;
  let result: SessionAdvanceResult;
  let stepsCompleted = 0;

  for (let i = 0; i < inputQueue.length; i++) {
    const userInput = inputQueue[i]!;
    result = await advanceSession(session, deps, cursor, {
      mode: 'continue',
      userInput,
    });

    cursor = result.cursor;
    stepsCompleted++;

    const afterState = runtime.getState();
    currentSnapshot = {
      ...currentSnapshot,
      cursor: result.cursor,
      waitingFor: result.waitingFor,
      status: result.status,
      stateSnapshot: afterState,
      recentEvents: result.events,
      updatedAt: Date.now(),
      inputHistory: [
        ...currentSnapshot.inputHistory,
        {
          stepId: cursor.currentStepId ?? '',
          stepIndex: cursor.stepIndex,
          input: userInput,
          timestamp: Date.now(),
        },
      ],
    };

    // Stop early if session ended, errored, or no more input expected
    if (result.status === 'ended' || result.status === 'error') {
      break;
    }

    // If waiting_input but we have more inputs, continue the loop
    // If not waiting_input (paused), run a continue without input to advance
    if (result.status !== 'waiting_input' && i < inputQueue.length - 1) {
      // Session is running (paused after step), advance without input
      result = await advanceSession(session, deps, cursor, { mode: 'continue' });
      cursor = result.cursor;
      currentSnapshot = {
        ...currentSnapshot,
        cursor: result.cursor,
        waitingFor: result.waitingFor,
        status: result.status,
        stateSnapshot: runtime.getState(),
        recentEvents: result.events,
        updatedAt: Date.now(),
      };
      if (result.status === 'ended' || result.status === 'error') {
        break;
      }
    }
  }

  const afterState = runtime.getState();
  const savedSnapshot = await finalizeSnapshot(projectRoot, currentSnapshot, result!, parsed.cleanup, manager);
  const diagnostics = await buildDiagnosticsFromResult(runtime, result!, parsed.verbose, undefined);

  return {
    exitCode: result!.status === 'error' ? 1 : 0,
    payload: buildAdvancePayload(projectRoot, savedSnapshot.runId, result!, diagnostics, beforeState, afterState),
  };
}

async function retryCurrentStep(
  projectRoot: string,
  parsed: ParsedDebugArgs,
  manager: DebugSessionManager,
  runManager: RunManager,
  dependencies: DebugCommandDependencies,
): Promise<CommandResult> {
  let snapshot: DebugRunSnapshot;
  try {
    snapshot = await runManager.readSnapshot({ runId: parsed.runId, latest: parsed.latest });
  } catch (error) {
    if (error instanceof EngineHttpError) {
      return buildCommandResultFromRunError(projectRoot, error, 2);
    }
    throw error;
  }

  if (snapshot.status !== 'error') {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: snapshot.runId,
        currentStepId: snapshot.cursor.currentStepId,
        currentStepIndex: snapshot.cursor.stepIndex,
        stateSummary: buildStateSummary(snapshot.stateSnapshot),
        diagnostics: [
          buildCliDiagnostic({
            code: 'RETRY_NOT_APPLICABLE',
            message: `--retry can only be used when run status is "error", current status: "${snapshot.status}"`,
            suggestions: [
              'Use --continue or --step to advance the session normally',
            ],
          }),
        ],
      }),
    };
  }

  // Re-execute from the same cursor position (retry the failed step)
  const runtime = await dependencies.createRuntime(projectRoot);
  if (!runtime.hasSession()) {
    throw new EngineHttpError('项目缺少 session.json，无法恢复 debug 模式', 400, 'NO_SESSION');
  }
  runtime.restoreState(snapshot.stateSnapshot);

  const beforeState = runtime.getState();
  const result = await advanceSession(runtime.getSession()!, createRunnerDeps(runtime), snapshot.cursor, {
    mode: 'step' as SessionAdvanceMode,
    userInput: parsed.input,
  });
  const afterState = runtime.getState();

  const nextSnapshot: DebugRunSnapshot = {
    ...snapshot,
    cursor: result.cursor,
    waitingFor: result.waitingFor,
    status: result.status,
    stateSnapshot: afterState,
    recentEvents: result.events,
    updatedAt: Date.now(),
    inputHistory: snapshot.inputHistory,
  };

  const savedSnapshot = await finalizeSnapshot(projectRoot, nextSnapshot, result, parsed.cleanup, manager);
  const diagnostics = await buildDiagnosticsFromResult(runtime, result, parsed.verbose, undefined);

  return {
    exitCode: result.status === 'error' ? 1 : 0,
    payload: buildAdvancePayload(projectRoot, savedSnapshot.runId, result, diagnostics, beforeState, afterState),
  };
}

async function skipCurrentStep(
  projectRoot: string,
  parsed: ParsedDebugArgs,
  manager: DebugSessionManager,
  runManager: RunManager,
  dependencies: DebugCommandDependencies,
): Promise<CommandResult> {
  let snapshot: DebugRunSnapshot;
  try {
    snapshot = await runManager.readSnapshot({ runId: parsed.runId, latest: parsed.latest });
  } catch (error) {
    if (error instanceof EngineHttpError) {
      return buildCommandResultFromRunError(projectRoot, error, 2);
    }
    throw error;
  }

  if (snapshot.status !== 'error' && snapshot.status !== 'paused') {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: snapshot.runId,
        currentStepId: snapshot.cursor.currentStepId,
        currentStepIndex: snapshot.cursor.stepIndex,
        stateSummary: buildStateSummary(snapshot.stateSnapshot),
        diagnostics: [
          buildCliDiagnostic({
            code: 'SKIP_NOT_APPLICABLE',
            message: `--skip can only be used when run status is "error" or "paused", current status: "${snapshot.status}"`,
            suggestions: [
              'Use --continue or --step to advance the session normally',
            ],
          }),
        ],
      }),
    };
  }

  // Move cursor to the next step without executing the current one
  const runtime = await dependencies.createRuntime(projectRoot);
  if (!runtime.hasSession()) {
    throw new EngineHttpError('项目缺少 session.json，无法恢复 debug 模式', 400, 'NO_SESSION');
  }
  runtime.restoreState(snapshot.stateSnapshot);

  // Find the current step and determine its "next"
  const session = runtime.getSession()!;
  const currentStep = session.steps.find((s) => s.id === snapshot.cursor.currentStepId);

  if (!currentStep || !('next' in currentStep) || !currentStep.next) {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: snapshot.runId,
        currentStepId: snapshot.cursor.currentStepId,
        currentStepIndex: snapshot.cursor.stepIndex,
        stateSummary: buildStateSummary(snapshot.stateSnapshot),
        diagnostics: [
          buildCliDiagnostic({
            code: 'SKIP_NO_NEXT',
            message: `Cannot skip step "${snapshot.cursor.currentStepId}" — it has no "next" step (Branch or End step)`,
            suggestions: [
              'Use --start --force-new to restart the session',
            ],
          }),
        ],
      }),
    };
  }

  // Advance cursor to the next step
  const nextStepId = currentStep.next as string;
  const nextStepIndex = session.steps.findIndex((s) => s.id === nextStepId);
  const skippedCursor = {
    ...snapshot.cursor,
    currentStepId: nextStepId,
    stepIndex: nextStepIndex >= 0 ? nextStepIndex : snapshot.cursor.stepIndex + 1,
  };

  const nextSnapshot: DebugRunSnapshot = {
    ...snapshot,
    cursor: skippedCursor,
    waitingFor: null,
    status: 'paused' as const,
    recentEvents: [],
    updatedAt: Date.now(),
  };

  await manager.saveRun(nextSnapshot);
  await manager.setActiveRun(projectRoot, nextSnapshot.runId);

  return {
    exitCode: 0,
    payload: buildAdvancePayload(projectRoot, nextSnapshot.runId, {
      status: 'paused',
      cursor: skippedCursor,
      waitingFor: null,
      events: [],
    }, [], snapshot.stateSnapshot, snapshot.stateSnapshot),
  };
}

async function finalizeSnapshot(
  projectRoot: string,
  snapshot: DebugRunSnapshot,
  result: SessionAdvanceResult,
  cleanup: boolean,
  manager: DebugSessionManager,
): Promise<DebugRunSnapshot> {
  await manager.saveRun(snapshot);

  if (result.status === 'waiting_input' || result.status === 'paused') {
    await manager.setActiveRun(projectRoot, snapshot.runId);
    return snapshot;
  }

  await manager.clearActiveRun(projectRoot, snapshot.runId);
  if (cleanup) {
    await manager.deleteRun(snapshot.runId);
  }
  return snapshot;
}

async function buildDiagnosticsFromResult(
  runtime: EngineRuntime,
  result: SessionAdvanceResult,
  verbose: boolean,
  input: string | undefined,
): Promise<DiagnosticPayload[]> {
  if (result.status !== 'error' || !result.diagnostic) {
    return [];
  }

  return [
    buildDebugDiagnostic({
      project: runtime.getProject(),
      error: result.diagnostic,
      verbose,
      input,
      stateSnapshot: runtime.getState(),
    }),
  ];
}

interface LLMTrace {
  nodeId: string;
  model: string;
  request: string;
  response: string;
  latencyMs?: number;
  cached?: boolean;
}

function registerLLMTraceHooks(runtime: EngineRuntime): LLMTrace[] {
  const traces: LLMTrace[] = [];
  const pendingRequests = new Map<string, { model: string; messages: string }>();

  runtime.registerHooks({
    onLLMRequest: (event: LLMRequestEvent) => {
      const lastMsg = event.messages[event.messages.length - 1];
      const preview = lastMsg?.content?.slice(0, 500) ?? '';
      pendingRequests.set(`${event.executionId}:${event.nodeId}`, {
        model: event.model,
        messages: preview,
      });
    },
    onLLMResponse: (event: LLMResponseEvent) => {
      const key = `${event.executionId}:${event.nodeId}`;
      const pending = pendingRequests.get(key);
      traces.push({
        nodeId: event.nodeId,
        model: pending?.model ?? event.model,
        request: pending?.messages ?? '',
        response: event.text.slice(0, 500),
        latencyMs: event.latencyMs,
        cached: event.cached,
      });
      pendingRequests.delete(key);
    },
  });

  return traces;
}

function buildAdvancePayload(
  projectRoot: string,
  runId: string,
  result: SessionAdvanceResult,
  diagnostics: DiagnosticPayload[],
  beforeState: Record<string, StateValue>,
  afterState: Record<string, StateValue>,
  llmTraces?: LLMTrace[],
): DebugAdvancePayload {
  const waitingFor = toOutputWaitingFor(result.waitingFor);
  const stateSummary = buildStateSummary(afterState, beforeState);
  const observation = buildObservation({
    projectRoot,
    runId,
    status: result.status,
    waitingFor,
    currentStepId: result.cursor.currentStepId,
    currentStepIndex: result.cursor.stepIndex,
    diagnostics,
    stateSummary,
  });

  return {
    run_id: runId,
    status: result.status,
    waiting_for: waitingFor,
    events: result.events.map(toDebugEvent),
    state_summary: stateSummary,
    diagnostics,
    next_action: observation.suggested_next_action?.command ?? null,
    observation,
    ...(llmTraces && llmTraces.length > 0 ? { llm_traces: llmTraces } : {}),
  };
}

interface BuildErrorAdvancePayloadOptions {
  runId?: string;
  waitingFor?: DebugWaitingForPayload | null;
  currentStepId?: string | null;
  currentStepIndex?: number | null;
  stateSummary?: DebugStateSummary;
  diagnostics: DiagnosticPayload[];
  preferredAction?: DebugActionDescriptor;
}

function buildErrorAdvancePayload(
  projectRoot: string,
  options: BuildErrorAdvancePayloadOptions,
): DebugAdvancePayload {
  const waitingFor = options.waitingFor ?? null;
  const stateSummary = options.stateSummary ?? buildStateSummary({});
  const observation = buildObservation({
    projectRoot,
    runId: options.runId ?? null,
    status: 'error',
    waitingFor,
    currentStepId: options.currentStepId ?? waitingFor?.step_id ?? null,
    currentStepIndex: options.currentStepIndex ?? null,
    diagnostics: options.diagnostics,
    stateSummary,
    preferredAction: options.preferredAction,
  });

  return {
    run_id: options.runId ?? null,
    status: 'error',
    waiting_for: waitingFor,
    events: [],
    state_summary: stateSummary,
    diagnostics: options.diagnostics,
    next_action: observation.suggested_next_action?.command ?? null,
    observation,
  };
}

function toDebugEvent(event: SessionTraceEvent): DebugEvent {
  return toRunEvent(event) as DebugEvent;
}

function toOutputWaitingFor(waitingFor: SessionWaitingFor | null): DebugWaitingForPayload | null {
  return toRunWaitingFor(waitingFor) as DebugWaitingForPayload | null;
}

interface BuildObservationParams {
  projectRoot: string;
  runId: string | null;
  status: DebugAdvancePayload['status'];
  waitingFor: DebugWaitingForPayload | null;
  currentStepId: string | null;
  currentStepIndex: number | null;
  diagnostics: DiagnosticPayload[];
  stateSummary: DebugStateSummary;
  preferredAction?: DebugActionDescriptor;
}

function buildObservation(params: BuildObservationParams): DebugObservation {
  const primaryDiagnostic = params.diagnostics[0];
  const blockingReason = inferBlockingReason(params.status, primaryDiagnostic, params.waitingFor);
  const location = primaryDiagnostic?.location ?? buildStepLocation(params.waitingFor?.step_id ?? params.currentStepId);
  const allowedNextActions = dedupeActionDescriptors([
    ...(params.preferredAction ? [params.preferredAction] : []),
    ...buildAllowedNextActions({
      projectRoot: params.projectRoot,
      runId: params.runId,
      status: params.status,
      waitingFor: params.waitingFor,
      primaryDiagnostic,
      location,
    }),
  ]);

  return {
    summary: buildObservationSummary({
      blockingReason,
      waitingFor: params.waitingFor,
      currentStepId: params.currentStepId,
      rootCause: primaryDiagnostic?.root_cause,
      location,
    }),
    blocking_reason: blockingReason,
    current_step: {
      step_id: params.currentStepId ?? params.waitingFor?.step_id ?? primaryDiagnostic?.location?.step_id ?? null,
      step_index: params.currentStepIndex,
    },
    waiting_for: params.waitingFor,
    location,
    root_cause: primaryDiagnostic?.root_cause,
    state_delta: {
      changed_keys: params.stateSummary.changed,
      changed_values: params.stateSummary.changed_values,
      preview: params.stateSummary.preview,
    },
    allowed_next_actions: allowedNextActions,
    suggested_next_action: allowedNextActions[0] ?? null,
  };
}

function buildStateSummary(
  afterState: Record<string, StateValue>,
  beforeState: Record<string, StateValue> = afterState,
): DebugStateSummary {
  return buildRunStateSummary(afterState, beforeState) as DebugStateSummary;
}

function inferBlockingReason(
  status: DebugAdvancePayload['status'],
  diagnostic: DiagnosticPayload | undefined,
  waitingFor: DebugWaitingForPayload | null,
): DebugObservation['blocking_reason'] {
  if (status === 'waiting_input' || (waitingFor && diagnostic?.code === 'INPUT_REQUIRED')) {
    return 'awaiting_input';
  }
  if (status === 'paused') {
    return 'paused_after_step';
  }
  if (status === 'ended') {
    return 'session_ended';
  }

  switch (diagnostic?.code) {
    case 'NO_ACTIVE_RUN':
    case 'RUN_NOT_FOUND':
      return 'missing_run';
    case 'SESSION_HASH_MISMATCH':
      return 'snapshot_invalid';
    case 'ACTIVE_RUN_EXISTS':
      return 'conflicting_run';
    case 'DEBUG_INVALID_ARGS':
    case 'DEBUG_ACTION_REQUIRED':
    case 'DEBUG_ACTION_CONFLICT':
    case 'DEBUG_FORCE_NEW_INVALID':
    case 'DEBUG_DELETE_RUN_ID_REQUIRED':
    case 'DEBUG_INPUT_INVALID':
    case 'DEBUG_UNKNOWN_FLAG':
    case 'DEBUG_UNEXPECTED_ARGUMENT':
    case 'DEBUG_FLAG_VALUE_REQUIRED':
    case 'DEBUG_FORMAT_INVALID':
    case 'INPUT_NOT_EXPECTED':
    case 'RUN_NOT_ACTIVE':
    case 'RUN_PROJECT_MISMATCH':
    case 'NO_SESSION':
      return 'invalid_request';
    default:
      return 'runtime_error';
  }
}

function buildObservationSummary(params: {
  blockingReason: DebugObservation['blocking_reason'];
  waitingFor: DebugWaitingForPayload | null;
  currentStepId: string | null;
  rootCause: DebugObservation['root_cause'];
  location: DebugObservation['location'];
}): string {
  if (params.blockingReason === 'awaiting_input' && params.waitingFor) {
    return `Run is waiting for ${params.waitingFor.kind} input at step "${params.waitingFor.step_id}".`;
  }
  if (params.blockingReason === 'paused_after_step') {
    return params.currentStepId
      ? `Run paused after one step. Next step is "${params.currentStepId}".`
      : 'Run paused after one step.';
  }
  if (params.blockingReason === 'session_ended') {
    return 'Run ended successfully.';
  }
  if (params.blockingReason === 'missing_run') {
    return params.rootCause?.message ?? 'No matching debug run is available.';
  }
  if (params.blockingReason === 'snapshot_invalid') {
    return 'The saved debug snapshot is stale because project files changed after the run started.';
  }
  if (params.blockingReason === 'conflicting_run') {
    return 'A different debug run is already active for this project.';
  }
  if (params.rootCause && params.location?.step_id && params.location.node_id) {
    return `Run stopped at step "${params.location.step_id}" node "${params.location.node_id}": ${params.rootCause.message}`;
  }
  if (params.rootCause && params.location?.step_id) {
    return `Run stopped at step "${params.location.step_id}": ${params.rootCause.message}`;
  }
  if (params.rootCause) {
    return params.rootCause.message;
  }
  return 'Debug command failed without a structured root cause.';
}

function buildStepLocation(stepId: string | null | undefined): DebugObservation['location'] | undefined {
  if (!stepId) {
    return undefined;
  }
  return {
    phase: 'session',
    step_id: stepId,
    file: 'session.json',
    json_path: `steps[id=${stepId}]`,
  };
}

function buildAllowedNextActions(params: {
  projectRoot: string;
  runId: string | null;
  status: DebugAdvancePayload['status'];
  waitingFor: DebugWaitingForPayload | null;
  primaryDiagnostic: DiagnosticPayload | undefined;
  location: DebugObservation['location'];
}): DebugActionDescriptor[] {
  const inspectStateCommand = params.runId
    ? `kal debug ${params.projectRoot} --state --run-id ${params.runId}`
    : null;
  const startNewRunCommand = `kal debug ${params.projectRoot} --start --force-new`;
  const continueCommand = `kal debug ${params.projectRoot} --continue`;
  const continueWithInputCommand = `kal debug ${params.projectRoot} --continue <input>`;
  const stepCommand = `kal debug ${params.projectRoot} --step`;
  const stepWithInputCommand = `kal debug ${params.projectRoot} --step <input>`;
  const deleteRunCommand = params.runId
    ? `kal debug ${params.projectRoot} --delete --run-id ${params.runId}`
    : null;

  if (params.status === 'waiting_input') {
    return [
      createAction('provide_input', continueWithInputCommand, 'Provide the requested input and continue until the next boundary.', true),
      createAction('step', stepWithInputCommand, 'Provide the requested input and stop after exactly one step.', true),
      ...(inspectStateCommand
        ? [createAction('inspect_state', inspectStateCommand, 'Inspect the saved run state before choosing an input.', false)]
        : []),
    ];
  }

  if (params.status === 'paused') {
    return [
      createAction('continue', continueCommand, 'Continue running until the next input boundary or the end of the session.', false),
      createAction('step', stepCommand, 'Advance exactly one step and pause again.', false),
      ...(inspectStateCommand
        ? [createAction('inspect_state', inspectStateCommand, 'Inspect the saved run state before continuing.', false)]
        : []),
    ];
  }

  if (params.status === 'ended') {
    return [
      createAction('start_new_run', startNewRunCommand, 'Start a fresh debug run from the beginning.', false),
      ...(deleteRunCommand
        ? [createAction('delete_run', deleteRunCommand, 'Delete the finished debug snapshot if you no longer need it.', false)]
        : []),
    ];
  }

  switch (params.primaryDiagnostic?.code) {
    case 'INPUT_REQUIRED':
      return [
        createAction('provide_input', continueWithInputCommand, 'Provide the requested input and continue until the next boundary.', true),
        createAction('step', stepWithInputCommand, 'Provide the requested input and stop after exactly one step.', true),
        ...(inspectStateCommand
          ? [createAction('inspect_state', inspectStateCommand, 'Inspect the saved run state before choosing an input.', false)]
          : []),
      ];
    case 'INPUT_NOT_EXPECTED':
      return [
        createAction('continue', continueCommand, 'Continue without passing input.', false),
        ...(inspectStateCommand
          ? [createAction('inspect_state', inspectStateCommand, 'Inspect the saved cursor and state before retrying.', false)]
          : []),
      ];
    case 'NO_ACTIVE_RUN':
      return [
        createAction('start_new_run', `kal debug ${params.projectRoot} --start`, 'Create a new debug run for this project.', false),
        createAction('list_runs', `kal debug ${params.projectRoot} --list`, 'List stored runs for the current project.', false),
      ];
    case 'ACTIVE_RUN_EXISTS':
      return [
        createAction('continue', continueCommand, 'Resume the currently active run.', false),
        ...(deleteRunCommand
          ? [createAction('delete_run', deleteRunCommand, 'Delete the active run if you want to replace it.', false)]
          : []),
        createAction('start_new_run', startNewRunCommand, 'Force creation of a fresh run.', false),
      ];
    case 'RUN_NOT_FOUND':
      return [
        createAction('list_runs', `kal debug ${params.projectRoot} --list`, 'List stored runs and pick a valid run ID.', false),
        createAction('start_new_run', `kal debug ${params.projectRoot} --start`, 'Create a new debug run.', false),
      ];
    case 'RUN_NOT_ACTIVE':
      return [
        createAction('start_new_run', startNewRunCommand, 'Start a fresh debug run because the old one is already finished or failed.', false),
        ...(inspectStateCommand
          ? [createAction('inspect_state', inspectStateCommand, 'Inspect the saved state of the old run.', false)]
          : []),
      ];
    case 'RUN_PROJECT_MISMATCH':
      return [
        createAction('start_new_run', `kal debug ${params.projectRoot} --start`, 'Create a run for the current project path.', false),
        createAction('list_runs', `kal debug ${params.projectRoot} --list`, 'List runs scoped to the current project root.', false),
      ];
    case 'SESSION_HASH_MISMATCH':
      return [
        createAction('start_new_run', startNewRunCommand, 'Start a fresh run because project files changed.', false),
        ...(deleteRunCommand
          ? [createAction('delete_run', deleteRunCommand, 'Delete the stale snapshot after creating a new run.', false)]
          : []),
      ];
    default: {
      const fixDescription = params.location?.file
        ? `Inspect and fix the problem near ${params.location.file}${params.location.json_path ? ` (${params.location.json_path})` : ''}.`
        : 'Inspect and fix the reported project configuration or node implementation.';
      return [
        createAction('fix_files', null, fixDescription, false),
        ...(inspectStateCommand
          ? [createAction('inspect_state', inspectStateCommand, 'Inspect the saved state captured near the failure.', false)]
          : []),
        createAction('retry', startNewRunCommand, 'After fixing the issue, start a fresh debug run.', false),
      ];
    }
  }
}

function createAction(
  kind: DebugActionDescriptor['kind'],
  command: string | null,
  description: string,
  inputRequired: boolean,
): DebugActionDescriptor {
  return {
    kind,
    command,
    description,
    input_required: inputRequired,
  };
}

function dedupeActionDescriptors(actions: DebugActionDescriptor[]): DebugActionDescriptor[] {
  const seen = new Set<string>();
  const unique: DebugActionDescriptor[] = [];

  for (const action of actions) {
    const key = `${action.kind}:${action.command ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(action);
  }

  return unique;
}


function parseDebugArgs(tokens: string[]): ParsedDebugArgs {
  let action: DebugAction | undefined;
  let projectPath: string | undefined;
  let runId: string | undefined;
  let input: string | undefined;
  let inputs: string[] | undefined;
  let stateDir: string | undefined;
  let format: 'json' | 'pretty' | 'agent' = 'json';
  let verbose = false;
  let cleanup = false;
  let forceNew = false;
  let latest = false;
  let lastAdvanceFlag: 'continue' | 'step' | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;

    if (token === '--start' || token === '--continue' || token === '--step' || token === '--state' || token === '--list' || token === '--delete' || token === '--retry' || token === '--skip') {
      if (action) {
        throw new EngineHttpError('Only one debug action can be specified', 400, 'DEBUG_ACTION_CONFLICT');
      }
      action = token.slice(2) as DebugAction;
      lastAdvanceFlag = action === 'continue' || action === 'step' ? action : null;
      continue;
    }

    if (token === '--force-new') {
      forceNew = true;
      continue;
    }

    if (token === '--verbose') {
      verbose = true;
      continue;
    }

    if (token === '--cleanup') {
      cleanup = true;
      continue;
    }

    if (token === '--latest') {
      latest = true;
      continue;
    }

    if (token === '--run-id' || token === '--run' || token === '--state-dir' || token === '--format' || token === '--input' || token === '--inputs') {
      const value = tokens[index + 1];
      if (!value || value.startsWith('--')) {
        throw new EngineHttpError(`Missing value for flag ${token}`, 400, 'DEBUG_FLAG_VALUE_REQUIRED', { flag: token });
      }
      if (token === '--run-id' || token === '--run') {
        runId = value;
      } else if (token === '--state-dir') {
        stateDir = value;
      } else if (token === '--format') {
        if (value !== 'json' && value !== 'pretty' && value !== 'agent') {
          throw new EngineHttpError(`Unsupported debug format: ${value}`, 400, 'DEBUG_FORMAT_INVALID', { format: value });
        }
        format = value;
      } else if (token === '--inputs') {
        inputs = value.split(',').map((s) => s.trim()).filter(Boolean);
        if (inputs.length === 0) {
          throw new EngineHttpError('--inputs requires at least one non-empty value', 400, 'DEBUG_INPUTS_EMPTY');
        }
      } else {
        input = value;
      }
      index += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      throw new EngineHttpError('Help requested', 400, 'DEBUG_HELP_REQUESTED');
    }

    if (token.startsWith('--')) {
      throw new EngineHttpError(`Unknown debug flag: ${token}`, 400, 'DEBUG_UNKNOWN_FLAG', { flag: token });
    }

    if (!projectPath) {
      projectPath = token;
      continue;
    }

    if ((lastAdvanceFlag === 'continue' || lastAdvanceFlag === 'step') && input === undefined) {
      input = token;
      continue;
    }

    throw new EngineHttpError(`Unexpected debug argument: ${token}`, 400, 'DEBUG_UNEXPECTED_ARGUMENT', { token });
  }

  if (!action) {
    throw new EngineHttpError('A debug action is required', 400, 'DEBUG_ACTION_REQUIRED');
  }
  if (forceNew && action !== 'start') {
    throw new EngineHttpError('--force-new can only be used with --start', 400, 'DEBUG_FORCE_NEW_INVALID');
  }
  if (action === 'delete' && !runId) {
    throw new EngineHttpError('--delete requires --run-id', 400, 'DEBUG_DELETE_RUN_ID_REQUIRED');
  }
  if ((action === 'state' || action === 'list' || action === 'delete' || action === 'start' || action === 'retry' || action === 'skip') && input !== undefined) {
    throw new EngineHttpError('Input can only be provided with --continue or --step', 400, 'DEBUG_INPUT_INVALID');
  }
  if (inputs && input) {
    throw new EngineHttpError('Cannot use both --input and --inputs', 400, 'DEBUG_INPUT_CONFLICT');
  }
  if (inputs && action !== 'continue') {
    throw new EngineHttpError('--inputs can only be used with --continue', 400, 'DEBUG_INPUTS_ACTION_INVALID');
  }

  return {
    action,
    projectPath,
    runId,
    input,
    inputs,
    stateDir,
    format,
    verbose,
    cleanup,
    forceNew,
    latest,
  };
}

function resolveProjectRoot(projectPath: string | undefined, cwd: string): string {
  return resolve(cwd, projectPath ?? '.');
}

function renderPretty(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return `${String(payload)}\n`;
  }

  if ('runs' in payload) {
    const list = payload as DebugListPayload;
    const lines = [`Project: ${list.project_root}`];
    for (const run of list.runs) {
      lines.push(`- ${run.run_id} ${run.status}${run.active ? ' [active]' : ''}`);
    }
    return `${lines.join('\n')}\n`;
  }

  if ('deleted' in payload) {
    const result = payload as DebugDeletePayload;
    return `Deleted run ${result.run_id}\n`;
  }

  if ('state' in payload) {
    const statePayload = payload as DebugStatePayload;
    return [
      `Run: ${statePayload.run_id}`,
      `Status: ${statePayload.status}`,
      `Summary: ${statePayload.observation.summary}`,
      `Cursor: ${statePayload.cursor.currentStepId ?? '<end>'} (#${statePayload.cursor.stepIndex})`,
      `State Preview: ${JSON.stringify(statePayload.state_summary.preview)}`,
      `State: ${JSON.stringify(statePayload.state, null, 2)}`,
    ].join('\n') + '\n';
  }

  const advance = payload as DebugAdvancePayload;
  const lines = [
    `Run: ${advance.run_id ?? '<none>'}`,
    `Status: ${advance.status}`,
    `Summary: ${advance.observation.summary}`,
  ];
  if (advance.waiting_for) {
    lines.push(`Waiting: ${advance.waiting_for.kind} @ ${advance.waiting_for.step_id}`);
  }
  if (advance.observation.root_cause) {
    lines.push(`Root Cause: ${advance.observation.root_cause.code}: ${advance.observation.root_cause.message}`);
  }
  if (advance.observation.location?.file) {
    lines.push(`Location: ${advance.observation.location.file}${advance.observation.location.json_path ? ` (${advance.observation.location.json_path})` : ''}`);
  }
  if (advance.state_summary.changed.length > 0) {
    lines.push(`State Changed: ${advance.state_summary.changed.join(', ')}`);
  }
  if (advance.events.length > 0) {
    lines.push('Events:');
    for (const event of advance.events) {
      if (event.type === 'end') {
        lines.push(`- end: ${event.message ?? ''}`.trim());
        continue;
      }
      lines.push(`- output ${event.step_id}`);
      if (event.normalized.narration) {
        lines.push(`  ${event.normalized.narration}`);
      }
    }
  }
  if (advance.diagnostics.length > 0) {
    lines.push('Diagnostics:');
    for (const diagnostic of advance.diagnostics) {
      lines.push(`- ${diagnostic.code}: ${diagnostic.message}`);
    }
  }
  if (advance.observation.allowed_next_actions.length > 0) {
    lines.push('Actions:');
    for (const action of advance.observation.allowed_next_actions) {
      const renderedAction = action.command ? `${action.kind}: ${action.command}` : `${action.kind}: ${action.description}`;
      lines.push(`- ${renderedAction}`);
    }
  }
  if (advance.observation.suggested_next_action?.command) {
    lines.push(`Next: ${advance.observation.suggested_next_action.command}`);
  }
  return `${lines.join('\n')}\n`;
}

function writeResult(io: EngineCliIO, result: CommandResult, format: 'json' | 'pretty' | 'agent'): number {
  let rendered: string;
  if (format === 'agent') {
    rendered = `${JSON.stringify(renderAgent(result.payload), null, 2)}\n`;
  } else if (format === 'pretty') {
    rendered = renderPretty(result.payload);
  } else {
    rendered = `${JSON.stringify(result.payload, null, 2)}\n`;
  }
  // Structured JSON payloads always go to stdout for machine consumption.
  // Only pretty-format errors go to stderr for human readability.
  if (result.exitCode !== 0 && format === 'pretty') {
    io.stderr(rendered);
  } else {
    io.stdout(rendered);
  }
  return result.exitCode;
}

function renderAgent(payload: unknown): Record<string, any> {
  if (!payload || typeof payload !== 'object') {
    return { status: 'unknown', summary: String(payload) };
  }

  // Handle list payload
  if ('runs' in payload) {
    const list = payload as DebugListPayload;
    return {
      runs: list.runs.map((r) => ({
        run_id: r.run_id,
        status: r.status,
        active: r.active,
      })),
    };
  }

  // Handle delete payload
  if ('deleted' in payload) {
    return payload as Record<string, any>;
  }

  // Handle state payload
  if ('state' in payload) {
    const statePayload = payload as DebugStatePayload;
    return {
      run_id: statePayload.run_id,
      status: statePayload.status,
      summary: statePayload.observation.summary,
      waiting_for: statePayload.waiting_for,
      state_changed: statePayload.state_summary.changed,
    };
  }

  // Handle advance payload (most common)
  const advance = payload as DebugAdvancePayload;
  const narration = advance.events
    .filter((e): e is DebugOutputEvent => e.type === 'output')
    .map((e) => e.normalized.narration)
    .filter(Boolean)
    .join('\n')
    .slice(0, 500) || undefined;

  return {
    run_id: advance.run_id,
    status: advance.status,
    summary: advance.observation.summary,
    waiting_for: advance.waiting_for,
    state_changed: advance.state_summary.changed,
    narration,
    diagnostics: advance.diagnostics.map((d) => ({ code: d.code, message: d.message })),
    next: advance.observation.suggested_next_action?.command ?? null,
  };
}
