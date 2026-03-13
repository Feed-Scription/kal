/**
 * Phase 3 tests: ComputeState node, Branch setState, DynamicChoice
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ComputeState } from '../../../node/builtin/utility-nodes';
import { StateStore } from '../../../state-store';
import type { NodeContext } from '../../../types/node';
import { advanceSession, createSessionCursor } from '../../../session/session-runner';
import type { SessionDefinition, StateValue } from '../../../types/types';

describe('ComputeState node', () => {
  let context: NodeContext;
  let stateStore: StateStore;

  beforeEach(() => {
    stateStore = new StateStore();
    context = {
      state: {
        get: (key: string) => stateStore.get(key),
        set: (key: string, value: StateValue) => stateStore.set(key, value),
        delete: (key: string) => stateStore.delete(key),
        append: (key: string, value: any) => stateStore.append(key, value),
        appendMany: (key: string, values: any[]) => stateStore.appendMany(key, values),
      },
      llm: {
        invoke: async () => ({ text: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }),
      },
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      executionId: 'test-exec',
      nodeId: 'test-node',
    };
  });

  it('should increment a number', async () => {
    const result = await ComputeState.execute(
      { value: 5 },
      { operation: 'increment', operand: 3 },
      context,
    );
    expect(result.result).toBe(8);
    expect(result.success).toBe(true);
  });

  it('should decrement a number', async () => {
    const result = await ComputeState.execute(
      { value: 10 },
      { operation: 'decrement', operand: 4 },
      context,
    );
    expect(result.result).toBe(6);
    expect(result.success).toBe(true);
  });

  it('should multiply a number', async () => {
    const result = await ComputeState.execute(
      { value: 7 },
      { operation: 'multiply', operand: 3 },
      context,
    );
    expect(result.result).toBe(21);
    expect(result.success).toBe(true);
  });

  it('should divide a number', async () => {
    const result = await ComputeState.execute(
      { value: 20 },
      { operation: 'divide', operand: 4 },
      context,
    );
    expect(result.result).toBe(5);
    expect(result.success).toBe(true);
  });

  it('should fail on division by zero', async () => {
    const result = await ComputeState.execute(
      { value: 10 },
      { operation: 'divide', operand: 0 },
      context,
    );
    expect(result.success).toBe(false);
  });

  it('should lookup value in table', async () => {
    const result = await ComputeState.execute(
      { value: 'key2' },
      { operation: 'lookup', operand: { key1: 'value1', key2: 'value2', key3: 'value3' } },
      context,
    );
    expect(result.result).toBe('value2');
    expect(result.success).toBe(true);
  });

  it('should fail on missing lookup key', async () => {
    const result = await ComputeState.execute(
      { value: 'missing' },
      { operation: 'lookup', operand: { key1: 'value1' } },
      context,
    );
    expect(result.success).toBe(false);
  });

  it('should evaluate conditional (true case)', async () => {
    const result = await ComputeState.execute(
      { value: 15 },
      { operation: 'conditional', condition: 'value > 10', trueValue: 'high', falseValue: 'low' },
      context,
    );
    expect(result.result).toBe('high');
    expect(result.success).toBe(true);
  });

  it('should evaluate conditional (false case)', async () => {
    const result = await ComputeState.execute(
      { value: 5 },
      { operation: 'conditional', condition: 'value > 10', trueValue: 'high', falseValue: 'low' },
      context,
    );
    expect(result.result).toBe('low');
    expect(result.success).toBe(true);
  });

  it('should support all comparison operators in conditional', async () => {
    const tests = [
      { value: 10, condition: 'value == 10', expected: true },
      { value: 10, condition: 'value != 5', expected: true },
      { value: 10, condition: 'value >= 10', expected: true },
      { value: 10, condition: 'value <= 10', expected: true },
      { value: 10, condition: 'value < 20', expected: true },
      { value: 10, condition: 'value > 5', expected: true },
    ];

    for (const test of tests) {
      const result = await ComputeState.execute(
        { value: test.value },
        { operation: 'conditional', condition: test.condition, trueValue: true, falseValue: false },
        context,
      );
      expect(result.result).toBe(test.expected);
    }
  });
});

describe('Branch setState', () => {
  it('should apply setState from matched condition', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0',
      steps: [
        {
          id: 'branch1',
          type: 'Branch',
          conditions: [
            { when: 'state.value > 5', next: 'end1', setState: { result: 'high' } },
          ],
          default: 'end2',
          defaultSetState: { result: 'low' },
        },
        { id: 'end1', type: 'End', message: 'High path' },
        { id: 'end2', type: 'End', message: 'Low path' },
      ],
    };

    const state: Record<string, StateValue> = {
      value: { type: 'number', value: 10 },
      result: { type: 'string', value: '' },
    };

    const result = await advanceSession(
      session,
      {
        executeFlow: async () => ({ executionId: 'test', flowId: 'test', outputs: {}, errors: [], durationMs: 0 }),
        getState: () => state,
        setState: (key, value) => { state[key] = { type: typeof value as any, value }; },
      },
      createSessionCursor(session),
      { mode: 'continue' },
    );

    expect(result.status).toBe('ended');
    expect(state.result.value).toBe('high');
  });

  it('should apply defaultSetState when no condition matches', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0',
      steps: [
        {
          id: 'branch1',
          type: 'Branch',
          conditions: [
            { when: 'state.value > 20', next: 'end1', setState: { result: 'very_high' } },
          ],
          default: 'end2',
          defaultSetState: { result: 'normal' },
        },
        { id: 'end1', type: 'End', message: 'Very high path' },
        { id: 'end2', type: 'End', message: 'Normal path' },
      ],
    };

    const state: Record<string, StateValue> = {
      value: { type: 'number', value: 10 },
      result: { type: 'string', value: '' },
    };

    const result = await advanceSession(
      session,
      {
        executeFlow: async () => ({ executionId: 'test', flowId: 'test', outputs: {}, errors: [], durationMs: 0 }),
        getState: () => state,
        setState: (key, value) => { state[key] = { type: typeof value as any, value }; },
      },
      createSessionCursor(session),
      { mode: 'continue' },
    );

    expect(result.status).toBe('ended');
    expect(state.result.value).toBe('normal');
  });

  it('should work without setState (backward compatible)', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0',
      steps: [
        {
          id: 'branch1',
          type: 'Branch',
          conditions: [
            { when: 'state.value > 5', next: 'end1' },
          ],
          default: 'end2',
        },
        { id: 'end1', type: 'End', message: 'High path' },
        { id: 'end2', type: 'End', message: 'Low path' },
      ],
    };

    const state: Record<string, StateValue> = {
      value: { type: 'number', value: 10 },
    };

    const result = await advanceSession(
      session,
      {
        executeFlow: async () => ({ executionId: 'test', flowId: 'test', outputs: {}, errors: [], durationMs: 0 }),
        getState: () => state,
        setState: (key, value) => { state[key] = { type: typeof value as any, value }; },
      },
      createSessionCursor(session),
      { mode: 'continue' },
    );

    expect(result.status).toBe('ended');
  });
});

describe('DynamicChoice', () => {
  it('should filter options based on when conditions', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0',
      steps: [
        {
          id: 'choice1',
          type: 'DynamicChoice',
          promptText: 'Choose an action',
          options: [
            { label: 'Option A', value: 'a', when: 'state.unlocked_a == true' },
            { label: 'Option B', value: 'b', when: 'state.unlocked_b == true' },
            { label: 'Option C', value: 'c' }, // always visible
          ],
          stateKey: 'choice',
          next: 'end1',
        },
        { id: 'end1', type: 'End' },
      ],
    };

    const state: Record<string, StateValue> = {
      unlocked_a: { type: 'boolean', value: false },
      unlocked_b: { type: 'boolean', value: true },
      choice: { type: 'string', value: '' },
    };

    const result = await advanceSession(
      session,
      {
        executeFlow: async () => ({ executionId: 'test', flowId: 'test', outputs: {}, errors: [], durationMs: 0 }),
        getState: () => state,
        setState: (key, value) => { state[key] = { type: typeof value as any, value }; },
      },
      createSessionCursor(session),
      { mode: 'step' },
    );

    expect(result.status).toBe('waiting_input');
    expect(result.waitingFor?.kind).toBe('choice');
    expect(result.waitingFor?.options).toHaveLength(2);
    expect(result.waitingFor?.options?.map(o => o.value)).toEqual(['b', 'c']);
  });

  it('should show all options when no when conditions', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0',
      steps: [
        {
          id: 'choice1',
          type: 'DynamicChoice',
          promptText: 'Choose',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
          stateKey: 'choice',
          next: 'end1',
        },
        { id: 'end1', type: 'End' },
      ],
    };

    const state: Record<string, StateValue> = {
      choice: { type: 'string', value: '' },
    };

    const result = await advanceSession(
      session,
      {
        executeFlow: async () => ({ executionId: 'test', flowId: 'test', outputs: {}, errors: [], durationMs: 0 }),
        getState: () => state,
        setState: (key, value) => { state[key] = { type: typeof value as any, value }; },
      },
      createSessionCursor(session),
      { mode: 'step' },
    );

    expect(result.status).toBe('waiting_input');
    expect(result.waitingFor?.options).toHaveLength(2);
  });

  it('should error when no options are visible', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0',
      steps: [
        {
          id: 'choice1',
          type: 'DynamicChoice',
          promptText: 'Choose',
          options: [
            { label: 'A', value: 'a', when: 'state.unlocked == true' },
          ],
          stateKey: 'choice',
          next: 'end1',
        },
        { id: 'end1', type: 'End' },
      ],
    };

    const state: Record<string, StateValue> = {
      unlocked: { type: 'boolean', value: false },
      choice: { type: 'string', value: '' },
    };

    const result = await advanceSession(
      session,
      {
        executeFlow: async () => ({ executionId: 'test', flowId: 'test', outputs: {}, errors: [], durationMs: 0 }),
        getState: () => state,
        setState: (key, value) => { state[key] = { type: typeof value as any, value }; },
      },
      createSessionCursor(session),
      { mode: 'step' },
    );

    expect(result.status).toBe('error');
    expect(result.diagnostic?.code).toBe('NO_VISIBLE_OPTIONS');
  });

  it('should accept user input and advance', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0',
      steps: [
        {
          id: 'choice1',
          type: 'DynamicChoice',
          promptText: 'Choose',
          options: [
            { label: 'A', value: 'a', when: 'state.unlocked == true' },
            { label: 'B', value: 'b' },
          ],
          stateKey: 'choice',
          next: 'end1',
        },
        { id: 'end1', type: 'End' },
      ],
    };

    const state: Record<string, StateValue> = {
      unlocked: { type: 'boolean', value: true },
      choice: { type: 'string', value: '' },
    };

    const result = await advanceSession(
      session,
      {
        executeFlow: async () => ({ executionId: 'test', flowId: 'test', outputs: {}, errors: [], durationMs: 0 }),
        getState: () => state,
        setState: (key, value) => { state[key] = { type: typeof value as any, value }; },
      },
      createSessionCursor(session),
      { mode: 'continue', userInput: 'a' },
    );

    expect(result.status).toBe('ended');
    expect(state.choice.value).toBe('a');
  });
});
