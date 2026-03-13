import {
  advanceSession,
  createSessionCursor,
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
  DebugRunSnapshot,
  DebugStateSummary,
  DebugStatePayload,
  DebugWaitingForPayload,
  DiagnosticPayload,
} from '../debug/types';
import { formatEngineError, EngineHttpError } from '../errors';
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
  stateDir?: string;
  format: 'json' | 'pretty' | 'agent';
  verbose: boolean;
  cleanup: boolean;
  forceNew: boolean;
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
  const manager = new DebugSessionManager(parsed.stateDir);

  try {
    let result: CommandResult;
    switch (parsed.action) {
      case 'list':
        result = await listRuns(projectRoot, manager);
        break;
      case 'delete':
        result = await deleteRun(projectRoot, parsed.runId!, manager);
        break;
      case 'state':
        result = await getState(projectRoot, parsed.runId, parsed.verbose, manager);
        break;
      case 'start':
        result = await startRun(projectRoot, parsed, manager, dependencies);
        break;
      case 'continue':
      case 'step':
        result = await advanceExistingRun(projectRoot, parsed, manager, dependencies);
        break;
      case 'retry':
        result = await retryCurrentStep(projectRoot, parsed, manager, dependencies);
        break;
      case 'skip':
        result = await skipCurrentStep(projectRoot, parsed, manager, dependencies);
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

async function listRuns(projectRoot: string, manager: DebugSessionManager): Promise<CommandResult> {
  const runs = await manager.listRuns(projectRoot);
  const payload: DebugListPayload = {
    project_root: projectRoot,
    runs: runs.map((run) => ({
      run_id: run.runId,
      status: run.status,
      waiting_for: toOutputWaitingFor(run.waitingFor),
      updated_at: run.updatedAt,
      created_at: run.createdAt,
      active: run.active,
    })),
  };
  return { exitCode: 0, payload };
}

async function deleteRun(
  projectRoot: string,
  runId: string,
  manager: DebugSessionManager,
): Promise<CommandResult> {
  const snapshot = await manager.readRun(runId);
  if (!snapshot || snapshot.projectRoot !== projectRoot) {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId,
        diagnostics: [
          buildCliDiagnostic({
            code: 'RUN_NOT_FOUND',
            message: `Debug run not found: ${runId}`,
            suggestions: [
              '运行 `kal debug <project> --list` 查看可用 run',
              '确认当前 project path 与 run 所属项目一致',
            ],
          }),
        ],
      }),
    };
  }

  await manager.deleteRun(runId);
  await manager.clearActiveRun(projectRoot, runId);

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
  manager: DebugSessionManager,
): Promise<CommandResult> {
  const snapshot = await resolveExistingRun(projectRoot, runId, manager);
  if ('exitCode' in snapshot) {
    return snapshot;
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
  manager: DebugSessionManager,
  dependencies: DebugCommandDependencies,
): Promise<CommandResult> {
  const activeRunId = await manager.getActiveRunId(projectRoot);
  if (activeRunId && !parsed.forceNew) {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: activeRunId,
        diagnostics: [
          buildCliDiagnostic({
            code: 'ACTIVE_RUN_EXISTS',
            message: `An active debug run already exists for ${projectRoot}`,
            suggestions: [
              '运行 `kal debug <project> --continue` 继续当前 run',
              '运行 `kal debug <project> --delete --run-id <id>` 删除旧 run',
              '或使用 `kal debug <project> --start --force-new` 创建新 run',
            ],
          }),
        ],
      }),
    };
  }

  const runtime = await dependencies.createRuntime(projectRoot);
  if (!runtime.hasSession()) {
    throw new EngineHttpError('项目缺少 session.json，无法启动 debug 模式', 400, 'NO_SESSION');
  }

  const session = runtime.getSession()!;
  const beforeState = runtime.getState();
  const result = await advanceSession(session, createRunnerDeps(runtime), createSessionCursor(session), {
    mode: 'continue',
  });
  const afterState = runtime.getState();
  const sessionHash = await manager.computeSessionHash(projectRoot);
  let snapshot = await manager.createRun({
    projectRoot,
    sessionHash,
    cursor: result.cursor,
    waitingFor: result.waitingFor,
    status: result.status,
    stateSnapshot: afterState,
    recentEvents: result.events,
    inputHistory: [],
  });
  snapshot = await finalizeSnapshot(projectRoot, snapshot, result, parsed.cleanup, manager);

  const diagnostics = await buildDiagnosticsFromResult(runtime, result, parsed.verbose, undefined);
  return {
    exitCode: result.status === 'error' ? 1 : 0,
    payload: buildAdvancePayload(projectRoot, snapshot.runId, result, diagnostics, beforeState, afterState),
  };
}

async function advanceExistingRun(
  projectRoot: string,
  parsed: ParsedDebugArgs,
  manager: DebugSessionManager,
  dependencies: DebugCommandDependencies,
): Promise<CommandResult> {
  const snapshotResult = await resolveExistingRun(projectRoot, parsed.runId, manager);
  if ('exitCode' in snapshotResult) {
    return snapshotResult;
  }

  const snapshot = snapshotResult;
  const currentHash = await manager.computeSessionHash(projectRoot);
  if (snapshot.sessionHash !== currentHash) {
    await manager.clearActiveRun(projectRoot, snapshot.runId);
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: snapshot.runId,
        currentStepId: snapshot.cursor.currentStepId,
        currentStepIndex: snapshot.cursor.stepIndex,
        stateSummary: buildStateSummary(snapshot.stateSnapshot),
        diagnostics: [
          buildCliDiagnostic({
            code: 'SESSION_HASH_MISMATCH',
            message: '项目文件已修改，当前调试快照已失效',
            suggestions: [
              '运行 `kal debug <project> --start --force-new` 创建新 run',
              `如需清理旧快照，运行 \`kal debug <project> --delete --run-id ${snapshot.runId}\``,
            ],
          }),
        ],
      }),
    };
  }

  if (snapshot.status === 'ended' || snapshot.status === 'error') {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: snapshot.runId,
        currentStepId: snapshot.cursor.currentStepId,
        currentStepIndex: snapshot.cursor.stepIndex,
        stateSummary: buildStateSummary(snapshot.stateSnapshot),
        diagnostics: [
          buildCliDiagnostic({
            code: 'RUN_NOT_ACTIVE',
            message: `Run ${snapshot.runId} is already ${snapshot.status}`,
            suggestions: [
              '运行 `kal debug <project> --start --force-new` 创建新 run',
              '如需查看旧状态，使用 `kal debug <project> --state --run-id <id>`',
            ],
          }),
        ],
      }),
    };
  }

  if (snapshot.waitingFor && parsed.input === undefined) {
    const waitingFor = toOutputWaitingFor(snapshot.waitingFor);
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: snapshot.runId,
        waitingFor,
        currentStepId: snapshot.cursor.currentStepId,
        currentStepIndex: snapshot.cursor.stepIndex,
        stateSummary: buildStateSummary(snapshot.stateSnapshot),
        diagnostics: [
          buildCliDiagnostic({
            code: 'INPUT_REQUIRED',
            message: `Run ${snapshot.runId} 正在等待 ${snapshot.waitingFor.kind} 输入`,
            suggestions: [
              `运行 \`kal debug <project> --${parsed.action} <input>\` 提供输入`,
              '必要时运行 `kal debug <project> --state` 查看当前状态',
            ],
          }),
        ],
        preferredAction: {
          kind: parsed.action === 'step' ? 'step' : 'provide_input',
          command: `kal debug ${projectRoot} --${parsed.action} <input>`,
          description: parsed.action === 'step'
            ? 'Provide the requested input and stop after one step.'
            : 'Provide the requested input and continue until the next boundary.',
          input_required: true,
        },
      }),
    };
  }

  if (!snapshot.waitingFor && parsed.input !== undefined) {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: snapshot.runId,
        currentStepId: snapshot.cursor.currentStepId,
        currentStepIndex: snapshot.cursor.stepIndex,
        stateSummary: buildStateSummary(snapshot.stateSnapshot),
        diagnostics: [
          buildCliDiagnostic({
            code: 'INPUT_NOT_EXPECTED',
            message: `Run ${snapshot.runId} 当前步骤不接受输入`,
            suggestions: [
              `运行 \`kal debug <project> --${parsed.action}\` 继续执行`,
              '必要时运行 `kal debug <project> --state` 查看当前 cursor',
            ],
          }),
        ],
      }),
    };
  }

  const runtime = await dependencies.createRuntime(projectRoot);
  if (!runtime.hasSession()) {
    throw new EngineHttpError('项目缺少 session.json，无法恢复 debug 模式', 400, 'NO_SESSION');
  }
  runtime.restoreState(snapshot.stateSnapshot);

  const beforeState = runtime.getState();
  const result = await advanceSession(runtime.getSession()!, createRunnerDeps(runtime), snapshot.cursor, {
    mode: parsed.action as SessionAdvanceMode,
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
    inputHistory: parsed.input === undefined
      ? snapshot.inputHistory
      : [
          ...snapshot.inputHistory,
          {
            stepId: snapshot.cursor.currentStepId ?? '',
            stepIndex: snapshot.cursor.stepIndex,
            input: parsed.input,
            timestamp: Date.now(),
          },
        ],
  };

  const savedSnapshot = await finalizeSnapshot(projectRoot, nextSnapshot, result, parsed.cleanup, manager);
  const diagnostics = await buildDiagnosticsFromResult(runtime, result, parsed.verbose, parsed.input);

  return {
    exitCode: result.status === 'error' ? 1 : 0,
    payload: buildAdvancePayload(projectRoot, savedSnapshot.runId, result, diagnostics, beforeState, afterState),
  };
}

async function retryCurrentStep(
  projectRoot: string,
  parsed: ParsedDebugArgs,
  manager: DebugSessionManager,
  dependencies: DebugCommandDependencies,
): Promise<CommandResult> {
  const snapshotResult = await resolveExistingRun(projectRoot, parsed.runId, manager);
  if ('exitCode' in snapshotResult) {
    return snapshotResult;
  }

  const snapshot = snapshotResult;

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
  dependencies: DebugCommandDependencies,
): Promise<CommandResult> {
  const snapshotResult = await resolveExistingRun(projectRoot, parsed.runId, manager);
  if ('exitCode' in snapshotResult) {
    return snapshotResult;
  }

  const snapshot = snapshotResult;

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

  const stateSummary = buildStateSummary(snapshot.stateSnapshot);

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

async function resolveExistingRun(
  projectRoot: string,
  runId: string | undefined,
  manager: DebugSessionManager,
): Promise<DebugRunSnapshot | CommandResult> {
  const effectiveRunId = runId ?? await manager.getActiveRunId(projectRoot);
  if (!effectiveRunId) {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        diagnostics: [
          buildCliDiagnostic({
            code: 'NO_ACTIVE_RUN',
            message: `No active debug run for ${projectRoot}`,
            suggestions: [
              '运行 `kal debug <project> --start` 创建新 run',
              '或使用 `kal debug <project> --list` 查看已有 runs',
            ],
          }),
        ],
      }),
    };
  }

  const snapshot = await manager.readRun(effectiveRunId);
  if (!snapshot) {
    await manager.clearActiveRun(projectRoot, effectiveRunId);
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: effectiveRunId,
        diagnostics: [
          buildCliDiagnostic({
            code: 'RUN_NOT_FOUND',
            message: `Debug run not found: ${effectiveRunId}`,
            suggestions: [
              '运行 `kal debug <project> --list` 查看可用 runs',
              '必要时重新运行 `kal debug <project> --start`',
            ],
          }),
        ],
      }),
    };
  }

  if (snapshot.projectRoot !== projectRoot) {
    return {
      exitCode: 2,
      payload: buildErrorAdvancePayload(projectRoot, {
        runId: snapshot.runId,
        diagnostics: [
          buildCliDiagnostic({
            code: 'RUN_PROJECT_MISMATCH',
            message: `Run ${snapshot.runId} 属于其他项目`,
            suggestions: ['使用匹配的 project path 或重新创建 run'],
          }),
        ],
      }),
    };
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

function createRunnerDeps(runtime: EngineRuntime) {
  return {
    executeFlow: (flowId: string, inputData?: Record<string, any>) => runtime.executeFlow(flowId, inputData ?? {}),
    getState: () => runtime.getState(),
    setState: (key: string, value: any) => runtime.setState(key, value),
  };
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
  if (event.type === 'end') {
    return {
      type: 'end',
      message: event.message,
    };
  }

  return {
    type: 'output',
    step_id: event.stepId,
    flow_id: event.flowId,
    raw: event.data,
    normalized: {
      narration: extractNarration(event.data),
      state_changes: diffStates(event.stateBefore, event.stateAfter),
      labels: Object.keys(event.data).sort(),
    },
  };
}

function toOutputWaitingFor(waitingFor: SessionWaitingFor | null): DebugWaitingForPayload | null {
  if (!waitingFor) {
    return null;
  }
  return {
    kind: waitingFor.kind,
    step_id: waitingFor.stepId,
    prompt_text: waitingFor.promptText,
    options: waitingFor.options,
  };
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
  const changedValues = diffStates(beforeState, afterState);
  return {
    total_keys: Object.keys(afterState).length,
    keys: Object.keys(afterState).sort(),
    changed: Object.keys(changedValues).sort(),
    changed_values: changedValues,
    preview: buildStatePreview(afterState),
  };
}

function diffStates(
  beforeState: Record<string, StateValue>,
  afterState: Record<string, StateValue>,
): Record<string, { old: any; new: any }> {
  const changed: Record<string, { old: any; new: any }> = {};
  const keys = new Set([...Object.keys(beforeState), ...Object.keys(afterState)]);

  for (const key of [...keys].sort()) {
    const beforeValue = beforeState[key];
    const afterValue = afterState[key];
    const beforeJson = beforeValue ? JSON.stringify(beforeValue) : '';
    const afterJson = afterValue ? JSON.stringify(afterValue) : '';
    if (beforeJson === afterJson) {
      continue;
    }
    changed[key] = {
      old: beforeValue?.value ?? null,
      new: afterValue?.value ?? null,
    };
  }

  return changed;
}

function buildStatePreview(state: Record<string, StateValue>): Record<string, any> {
  const preview: Record<string, any> = {};

  for (const key of Object.keys(state).sort()) {
    if (Object.keys(preview).length >= 6) {
      break;
    }
    preview[key] = toPreviewValue(state[key]?.value ?? null);
  }

  return preview;
}

function toPreviewValue(value: any): any {
  if (typeof value === 'string') {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length > 4
      ? [...value.slice(0, 4), `...(${value.length - 4} more)`]
      : value.map((item) => toPreviewValue(item));
  }
  if (typeof value === 'object') {
    const preview: Record<string, any> = {};
    const entries = Object.entries(value);
    for (const [key, entryValue] of entries.slice(0, 4)) {
      preview[key] = toPreviewValue(entryValue);
    }
    if (entries.length > 4) {
      preview.__truncated__ = `${entries.length - 4} more keys`;
    }
    return preview;
  }
  return String(value);
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

function extractNarration(data: Record<string, any>): string | undefined {
  const preferredKeys = ['narration', 'text', 'message', 'reply'];
  for (const key of preferredKeys) {
    if (typeof data[key] === 'string' && data[key].trim().length > 0) {
      return data[key];
    }
  }

  for (const value of Object.values(data)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function parseDebugArgs(tokens: string[]): ParsedDebugArgs {
  let action: DebugAction | undefined;
  let projectPath: string | undefined;
  let runId: string | undefined;
  let input: string | undefined;
  let stateDir: string | undefined;
  let format: 'json' | 'pretty' | 'agent' = 'json';
  let verbose = false;
  let cleanup = false;
  let forceNew = false;
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

    if (token === '--run-id' || token === '--state-dir' || token === '--format' || token === '--input') {
      const value = tokens[index + 1];
      if (!value || value.startsWith('--')) {
        throw new EngineHttpError(`Missing value for flag ${token}`, 400, 'DEBUG_FLAG_VALUE_REQUIRED', { flag: token });
      }
      if (token === '--run-id') {
        runId = value;
      } else if (token === '--state-dir') {
        stateDir = value;
      } else if (token === '--format') {
        if (value !== 'json' && value !== 'pretty' && value !== 'agent') {
          throw new EngineHttpError(`Unsupported debug format: ${value}`, 400, 'DEBUG_FORMAT_INVALID', { format: value });
        }
        format = value;
      } else {
        input = value;
      }
      index += 1;
      continue;
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

  return {
    action,
    projectPath,
    runId,
    input,
    stateDir,
    format,
    verbose,
    cleanup,
    forceNew,
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
  io.stdout(rendered);
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
