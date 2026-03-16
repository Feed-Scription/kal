import { describe, expect, it, vi } from 'vitest';
import { StateStore } from '../../state-store';
import {
  advanceSession,
  createSessionCursor,
  inspectCurrentSessionStep,
  previewAdvanceSession,
  type SessionRunnerDeps,
} from '../../session/session-runner';
import type { SessionDefinition } from '../../types/session';
import type { FlowExecutionResult } from '../../flow/flow-executor';

function makeResult(flowId: string, outputs: Record<string, any> = {}): FlowExecutionResult {
  return {
    executionId: 'exec-test',
    flowId,
    outputs,
    errors: [],
    durationMs: 10,
  };
}

function makeDeps(overrides?: {
  executeFlow?: SessionRunnerDeps['executeFlow'];
  initialState?: Record<string, { type: any; value: any }>;
}): SessionRunnerDeps {
  const state = new StateStore();
  state.restore(overrides?.initialState ?? {});

  return {
    executeFlow: overrides?.executeFlow ?? vi.fn(async (flowId: string, inputData?: Record<string, any>) => {
      if (flowId === 'main') {
        state.upsert('lastInput', 'string', inputData?.playerInput ?? '');
      }
      return makeResult(flowId, { result: `output-from-${flowId}` });
    }),
    getState: () => state.getAll(),
    setState: (key: string, value: any) => {
      const current = state.get(key);
      if (!current.exists || !current.value) {
        throw new Error(`State key not found: ${key}`);
      }
      const result = state.modify(key, value);
      if (!result.success) {
        throw result.error;
      }
    },
  };
}

describe('advanceSession', () => {
  it('continue 模式会自动推进到下一个输入边界', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'playerInput', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const result = await advanceSession(session, makeDeps(), createSessionCursor(session), {
      mode: 'continue',
    });

    expect(result.status).toBe('waiting_input');
    expect(result.waitingFor).toEqual({
      kind: 'prompt',
      stepId: 'turn',
      promptText: '你的行动？',
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'output',
      stepId: 'intro',
      flowId: 'intro',
      data: { result: 'output-from-intro' },
    });
  });

  it('continue 模式带输入时会执行交互步骤并推进到结束', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', promptText: '你的行动？', flowRef: 'main', inputChannel: 'playerInput', next: 'end' },
        { id: 'end', type: 'End', message: 'done' },
      ],
    };

    const deps = makeDeps();
    const result = await advanceSession(session, deps, createSessionCursor(session), {
      mode: 'continue',
      userInput: 'attack',
    });

    expect(result.status).toBe('ended');
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      type: 'output',
      stepId: 'turn',
      flowId: 'main',
      data: { result: 'output-from-main' },
    });
    expect(result.events[1]).toEqual({
      type: 'end',
      message: 'done',
    });
  });

  it('step 模式每次只推进一个步骤', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'middle' },
        { id: 'middle', type: 'RunFlow', flowRef: 'middle', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const result = await advanceSession(session, makeDeps(), createSessionCursor(session), {
      mode: 'step',
    });

    expect(result.status).toBe('paused');
    expect(result.cursor).toEqual({
      currentStepId: 'middle',
      stepIndex: 1,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'output',
      stepId: 'intro',
    });
  });

  it('flow 返回 errors 时应立即失败', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const result = await advanceSession(session, makeDeps({
      executeFlow: vi.fn(async (flowId: string) => ({
        executionId: 'exec-test',
        flowId,
        outputs: { partial: true },
        errors: [{
          nodeId: 'llm',
          nodeType: 'GenerateText',
          errorType: 'execution',
          message: 'LLM failed',
          timestamp: Date.now(),
        }],
        durationMs: 20,
      })),
    }), createSessionCursor(session), {
      mode: 'continue',
    });

    expect(result.status).toBe('error');
    expect(result.diagnostic).toMatchObject({
      code: 'FLOW_EXECUTION_FAILED',
      stepId: 'intro',
      flowId: 'intro',
      nodeId: 'llm',
      nodeType: 'GenerateText',
    });
    expect(result.events).toHaveLength(0);
  });

  it('在非交互步骤传入 input 时应报错', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const result = await advanceSession(session, makeDeps(), createSessionCursor(session), {
      mode: 'continue',
      userInput: 'unexpected',
    });

    expect(result.status).toBe('error');
    expect(result.diagnostic).toMatchObject({
      code: 'INPUT_NOT_EXPECTED',
      stepId: 'intro',
    });
  });

  it('inspectCurrentSessionStep 应该只检查当前交互步骤', () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'choice' },
        {
          id: 'choice',
          type: 'Choice',
          promptText: '选择道路',
          options: [{ label: '左', value: 'left' }],
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    };

    const inspection = inspectCurrentSessionStep(session, createSessionCursor(session), {});
    expect(inspection.status).toBe('paused');
    expect(inspection.waitingFor).toBeNull();
  });

  it('previewAdvanceSession 应该在 step 模式下无副作用推进到下一个输入边界', () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'choice' },
        {
          id: 'choice',
          type: 'Choice',
          promptText: '选择道路',
          options: [{ label: '左', value: 'left' }],
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    };

    const initialState = {
      progress: { type: 'string' as const, value: 'start' },
    };

    const preview = previewAdvanceSession(session, createSessionCursor(session), initialState, {
      mode: 'step',
    });

    expect(preview.status).toBe('waiting_input');
    expect(preview.cursor).toEqual({
      currentStepId: 'choice',
      stepIndex: 1,
    });
    expect(preview.stateAfter).toEqual(initialState);
  });

  it('previewAdvanceSession 应该在 dry-run 模拟中更新 stateKey 和 Branch setState', () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'name',
          type: 'Prompt',
          stateKey: 'playerName',
          promptText: '名字？',
          next: 'branch',
        },
        {
          id: 'branch',
          type: 'Branch',
          conditions: [{ when: 'state.playerName == "Alice"', next: 'end', setState: { result: 'ok' } }],
          default: 'end',
          defaultSetState: { result: 'other' },
        },
        { id: 'end', type: 'End' },
      ],
    };

    const initialState = {
      playerName: { type: 'string' as const, value: '' },
      result: { type: 'string' as const, value: '' },
    };

    const afterPrompt = previewAdvanceSession(session, createSessionCursor(session), initialState, {
      mode: 'step',
      userInput: 'Alice',
    });
    expect(afterPrompt.cursor).toEqual({
      currentStepId: 'branch',
      stepIndex: 1,
    });
    expect(afterPrompt.stateAfter.playerName?.value).toBe('Alice');

    const afterBranch = previewAdvanceSession(session, afterPrompt.cursor, afterPrompt.stateAfter, {
      mode: 'step',
    });
    expect(afterBranch.cursor).toEqual({
      currentStepId: 'end',
      stepIndex: 2,
    });
    expect(afterBranch.stateAfter.result?.value).toBe('ok');
  });
});
