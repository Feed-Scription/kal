import {
  advanceSession,
  createSessionCursor,
  type SessionAdvanceMode,
  type SessionAdvanceResult,
  type StateValue,
} from '@kal-ai/core';
import { join } from 'node:path';
import { DebugSessionManager } from './debug/session-manager';
import type { DebugRunSnapshot, StateChangeLogEntry } from './debug/types';
import { EngineHttpError } from './errors';
import { EngineRuntime } from './runtime';
import {
  buildRunStateSummary,
  buildRunStateView,
  buildRunSummary,
  buildRunView,
  createRunnerDeps,
  toRunWaitingFor,
} from './run-views';
import type {
  RunStateView,
  RunStreamEvent,
  RunSummary,
  RunView,
} from './types';

type RunListener = (event: RunStreamEvent) => void;

export interface RunSelection {
  runId?: string;
  latest?: boolean;
}

export interface CreateRunOptions {
  forceNew?: boolean;
  cleanup?: boolean;
  mode?: SessionAdvanceMode;
  onRuntimeCreated?: (runtime: EngineRuntime) => void;
  /** Auto-advance inputs for smoke replay mode. */
  smokeInputs?: string[];
  /** Max steps for smoke replay (default 20). */
  smokeMaxSteps?: number;
}

export interface AdvanceRunOptions extends RunSelection {
  cleanup?: boolean;
  input?: string;
  mode?: SessionAdvanceMode;
  onRuntimeCreated?: (runtime: EngineRuntime) => void;
}

export interface GetRunOptions extends RunSelection {
  validateHash?: boolean;
}

export interface RunExecutionResult {
  runtime: EngineRuntime;
  snapshot: DebugRunSnapshot;
  result: SessionAdvanceResult;
  beforeState: Record<string, StateValue>;
  afterState: Record<string, StateValue>;
  run: RunView;
}

export class RunManager {
  private readonly projectRoot: string;
  private readonly store: DebugSessionManager;
  private readonly createRuntimeFn: () => Promise<EngineRuntime>;
  private readonly listeners = new Set<RunListener>();

  private static computeStateChanges(
    beforeState: Record<string, StateValue>,
    afterState: Record<string, StateValue>,
    stepId: string,
    stepIndex: number,
  ): StateChangeLogEntry[] {
    const entries: StateChangeLogEntry[] = [];
    const now = Date.now();
    const allKeys = new Set([...Object.keys(beforeState), ...Object.keys(afterState)]);
    for (const key of allKeys) {
      const before = beforeState[key]?.value;
      const after = afterState[key]?.value;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        entries.push({ stepId, stepIndex, key, before, after, timestamp: now });
      }
    }
    return entries;
  }

  constructor(params: {
    projectRoot: string;
    createRuntime: () => Promise<EngineRuntime>;
    store?: DebugSessionManager;
  }) {
    this.projectRoot = params.projectRoot;
    this.store = params.store ?? new DebugSessionManager();
    this.createRuntimeFn = params.createRuntime;
  }

  static fromRuntime(runtime: EngineRuntime, stateDir?: string): RunManager {
    const projectRoot = runtime.getProjectRoot();
    return new RunManager({
      projectRoot,
      createRuntime: () => EngineRuntime.create(projectRoot),
      store: new DebugSessionManager(stateDir ?? join(projectRoot, '.kal', 'runs')),
    });
  }

  subscribe(listener: RunListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async listRuns(): Promise<RunSummary[]> {
    const runs = await this.store.listRuns(this.projectRoot);
    return runs.map(buildRunSummary);
  }

  async getRun(selection: RunSelection, options?: { validateHash?: boolean }): Promise<RunView> {
    const snapshot = await this.readSnapshot(selection, options);
    return buildRunView(snapshot, {
      active: await this.isActiveRun(snapshot.runId),
    });
  }

  async getRunState(selection: RunSelection, options?: { validateHash?: boolean }): Promise<RunStateView> {
    const snapshot = await this.readSnapshot(selection, options);
    return buildRunStateView(snapshot, {
      active: await this.isActiveRun(snapshot.runId),
    });
  }

  async readSnapshot(
    selection: RunSelection,
    options?: { validateHash?: boolean },
  ): Promise<DebugRunSnapshot> {
    return this.resolveSnapshot(selection, options?.validateHash ?? true);
  }

  async createRun(options: CreateRunOptions = {}): Promise<RunExecutionResult> {
    const activeRunId = await this.store.getActiveRunId(this.projectRoot);
    if (activeRunId && !options.forceNew) {
      throw new EngineHttpError(
        `An active run already exists for ${this.projectRoot}`,
        409,
        'ACTIVE_RUN_EXISTS',
        { runId: activeRunId },
      );
    }

    const runtime = await this.createRuntime();
    if (options.onRuntimeCreated) {
      options.onRuntimeCreated(runtime);
    }
    if (!runtime.hasSession()) {
      throw new EngineHttpError('Project has no session.json', 400, 'NO_SESSION');
    }

    const session = runtime.getSession()!;
    const beforeState = runtime.getState();
    const result = await advanceSession(
      session,
      createRunnerDeps(runtime),
      createSessionCursor(session),
      { mode: options.mode ?? 'continue' },
    );
    const afterState = runtime.getState();
    const sessionHash = await this.store.computeSessionHash(this.projectRoot);
    let snapshot = await this.store.createRun({
      projectRoot: this.projectRoot,
      sessionHash,
      cursor: result.cursor,
      waitingFor: result.waitingFor,
      status: result.status,
      stateSnapshot: afterState,
      recentEvents: result.events,
      inputHistory: [],
      stateChangeLog: [],
    });
    snapshot = await this.finalizeSnapshot(snapshot, result, options.cleanup ?? false);

    const run = buildRunView(snapshot, {
      active: await this.isActiveRun(snapshot.runId),
      beforeState,
    });
    this.emit({
      type: 'run.created',
      run,
    });

    return {
      runtime,
      snapshot,
      result,
      beforeState,
      afterState,
      run,
    };
  }

  /**
   * Create a run and auto-advance it using provided inputs (smoke replay mode).
   * Emits standard run stream events at each step so the UI can observe progress.
   */
  async smokeRun(options: CreateRunOptions): Promise<RunExecutionResult> {
    const inputs = [...(options.smokeInputs ?? [])];
    const maxSteps = options.smokeMaxSteps ?? 20;

    // Create the initial run
    let execResult = await this.createRun({
      ...options,
      forceNew: true,
      mode: 'continue',
      smokeInputs: undefined, // prevent recursion
    });

    let inputIndex = 0;
    let steps = 0;

    while (steps < maxSteps) {
      const { snapshot } = execResult;
      if (snapshot.status === 'ended' || snapshot.status === 'error') break;

      steps++;

      if (snapshot.waitingFor) {
        // Provide the next input or a default
        const input = inputs[inputIndex] ?? `[smoke-input-${inputIndex}]`;
        inputIndex++;
        try {
          execResult = await this.advanceRun({
            runId: snapshot.runId,
            input,
            mode: 'continue',
          });
        } catch {
          break;
        }
      } else {
        // No input needed, just advance
        try {
          execResult = await this.advanceRun({
            runId: snapshot.runId,
            mode: 'continue',
          });
        } catch {
          break;
        }
      }
    }

    return execResult;
  }

  async advanceRun(options: AdvanceRunOptions): Promise<RunExecutionResult> {
    const snapshot = await this.resolveSnapshot(options, true);
    if (snapshot.status === 'ended' || snapshot.status === 'error') {
      throw new EngineHttpError(
        `Run ${snapshot.runId} is already ${snapshot.status}`,
        409,
        'RUN_NOT_ACTIVE',
        this.buildRunErrorDetails(snapshot),
      );
    }

    if (snapshot.waitingFor && options.input === undefined) {
      throw new EngineHttpError(
        `Run ${snapshot.runId} is waiting for ${snapshot.waitingFor.kind} input`,
        400,
        'INPUT_REQUIRED',
        this.buildRunErrorDetails(snapshot),
      );
    }

    if (!snapshot.waitingFor && options.input !== undefined) {
      throw new EngineHttpError(
        `Run ${snapshot.runId} does not accept input at the current step`,
        400,
        'INPUT_NOT_EXPECTED',
        this.buildRunErrorDetails(snapshot),
      );
    }

    const runtime = await this.createRuntime();
    if (options.onRuntimeCreated) {
      options.onRuntimeCreated(runtime);
    }
    if (!runtime.hasSession()) {
      throw new EngineHttpError('Project has no session.json', 400, 'NO_SESSION');
    }

    runtime.restoreState(snapshot.stateSnapshot);
    const beforeState = runtime.getState();
    const result = await advanceSession(runtime.getSession()!, createRunnerDeps(runtime), snapshot.cursor, {
      mode: options.mode ?? 'continue',
      userInput: options.input,
    });
    const afterState = runtime.getState();
    const timestamp = Date.now();
    const stateChanges = RunManager.computeStateChanges(
      beforeState, afterState,
      snapshot.cursor.currentStepId ?? '',
      snapshot.cursor.stepIndex,
    );

    const nextSnapshot: DebugRunSnapshot = {
      ...snapshot,
      cursor: result.cursor,
      waitingFor: result.waitingFor,
      status: result.status,
      stateSnapshot: afterState,
      recentEvents: result.events,
      updatedAt: timestamp,
      stateChangeLog: [...(snapshot.stateChangeLog ?? []), ...stateChanges],
      inputHistory: options.input === undefined
        ? snapshot.inputHistory
        : [
            ...snapshot.inputHistory,
            {
              stepId: snapshot.cursor.currentStepId ?? '',
              stepIndex: snapshot.cursor.stepIndex,
              input: options.input,
              timestamp,
            },
          ],
    };

    const savedSnapshot = await this.finalizeSnapshot(nextSnapshot, result, options.cleanup ?? false);
    const run = buildRunView(savedSnapshot, {
      active: await this.isActiveRun(savedSnapshot.runId),
      beforeState,
    });
    this.emit({
      type: result.status === 'ended' ? 'run.ended' : 'run.updated',
      run,
    });

    return {
      runtime,
      snapshot: savedSnapshot,
      result,
      beforeState,
      afterState,
      run,
    };
  }

  async cancelRun(selection: RunSelection): Promise<RunView> {
    const snapshot = await this.resolveSnapshot(selection, false);
    await this.store.clearActiveRun(this.projectRoot, snapshot.runId);
    await this.store.deleteRun(snapshot.runId);

    const run = buildRunView(snapshot, { active: false });
    this.emit({
      type: 'run.cancelled',
      run,
    });
    return run;
  }

  async deleteRun(runId: string): Promise<void> {
    const snapshot = await this.store.readRun(runId);
    if (!snapshot || snapshot.projectRoot !== this.projectRoot) {
      throw new EngineHttpError(`Run not found: ${runId}`, 404, 'RUN_NOT_FOUND', { runId });
    }
    await this.store.deleteRun(runId);
    await this.store.clearActiveRun(this.projectRoot, runId);
  }

  private async createRuntime(): Promise<EngineRuntime> {
    return this.createRuntimeFn();
  }

  private async isActiveRun(runId: string): Promise<boolean> {
    return (await this.store.getActiveRunId(this.projectRoot)) === runId;
  }

  private async finalizeSnapshot(
    snapshot: DebugRunSnapshot,
    result: SessionAdvanceResult,
    cleanup: boolean,
  ): Promise<DebugRunSnapshot> {
    await this.store.saveRun(snapshot);

    if (result.status === 'waiting_input' || result.status === 'paused') {
      await this.store.setActiveRun(this.projectRoot, snapshot.runId);
      return snapshot;
    }

    await this.store.clearActiveRun(this.projectRoot, snapshot.runId);
    if (cleanup) {
      await this.store.deleteRun(snapshot.runId);
    }
    return snapshot;
  }

  private async resolveSnapshot(
    selection: RunSelection,
    validateHash: boolean,
  ): Promise<DebugRunSnapshot> {
    let effectiveRunId = selection.runId;

    if (!effectiveRunId && selection.latest) {
      const runs = await this.store.listRuns(this.projectRoot);
      if (runs.length > 0) {
        effectiveRunId = runs[0]!.runId;
      }
    }

    if (!effectiveRunId) {
      effectiveRunId = await this.store.getActiveRunId(this.projectRoot);
    }

    if (!effectiveRunId) {
      throw new EngineHttpError(`No active run for ${this.projectRoot}`, 404, 'NO_ACTIVE_RUN');
    }

    const snapshot = await this.store.readRun(effectiveRunId);
    if (!snapshot) {
      await this.store.clearActiveRun(this.projectRoot, effectiveRunId);
      throw new EngineHttpError(`Run not found: ${effectiveRunId}`, 404, 'RUN_NOT_FOUND', { runId: effectiveRunId });
    }

    if (snapshot.projectRoot !== this.projectRoot) {
      throw new EngineHttpError(`Run ${snapshot.runId} belongs to a different project`, 400, 'RUN_PROJECT_MISMATCH', {
        runId: snapshot.runId,
      });
    }

    if (validateHash) {
      const currentHash = await this.store.computeSessionHash(this.projectRoot);
      if (snapshot.sessionHash !== currentHash) {
        await this.store.clearActiveRun(this.projectRoot, snapshot.runId);
        const run = buildRunView(snapshot, { active: false });
        this.emit({
          type: 'run.invalidated',
          run,
        });
        throw new EngineHttpError(
          'Project files changed after this run started',
          409,
          'SESSION_HASH_MISMATCH',
          this.buildRunErrorDetails(snapshot, run),
        );
      }
    }

    return snapshot;
  }

  private buildRunErrorDetails(snapshot: DebugRunSnapshot, run?: RunView): Record<string, unknown> {
    return {
      runId: snapshot.runId,
      currentStepId: snapshot.cursor.currentStepId,
      currentStepIndex: snapshot.cursor.stepIndex,
      waitingFor: toRunWaitingFor(snapshot.waitingFor),
      stateSummary: buildRunStateSummary(snapshot.stateSnapshot),
      run: run ?? buildRunView(snapshot, { active: false }),
    };
  }

  private emit(event: RunStreamEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
