import { describe, it, expect, vi } from 'vitest';
import { runSession } from '../../session/session-executor';
import type { SessionExecutorDeps } from '../../session/session-executor';
import type { SessionDefinition } from '../../types/session';
import type { StateValue } from '../../types/types';
import type { FlowExecutionResult } from '../../flow/flow-executor';

function makeDeps(overrides?: Partial<SessionExecutorDeps>): SessionExecutorDeps {
  return {
    executeFlow: overrides?.executeFlow ?? vi.fn(async (flowId: string) => ({
      executionId: 'test',
      flowId,
      outputs: { result: `output-from-${flowId}` },
      errors: [],
      durationMs: 10,
    })),
    getState: overrides?.getState ?? (() => ({})),
    setState: overrides?.setState ?? vi.fn(),
  };
}

function makeResult(flowId: string, outputs: Record<string, any> = {}): FlowExecutionResult {
  return { executionId: 'test', flowId, outputs, errors: [], durationMs: 10 };
}

describe('runSession', () => {
  it('RunFlow yields output and advances to next', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const deps = makeDeps();
    const gen = runSession(session, deps);

    const r1 = await gen.next();
    expect(r1.value).toEqual({ type: 'output', stepId: 'intro', data: { result: 'output-from-intro' } });

    const r2 = await gen.next(undefined);
    expect(r2.value).toEqual({ type: 'end', message: undefined });

    const r3 = await gen.next(undefined);
    expect(r3.done).toBe(true);
  });

  it('Prompt yields prompt, receives input, then yields output', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', flowRef: 'main', inputChannel: 'playerInput', promptText: '你的行动？', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const deps = makeDeps();
    const gen = runSession(session, deps);

    const r1 = await gen.next();
    expect(r1.value).toEqual({ type: 'prompt', stepId: 'turn', promptText: '你的行动？' });

    const r2 = await gen.next('攻击哥布林');
    expect(r2.value).toEqual({ type: 'output', stepId: 'turn', data: { result: 'output-from-main' } });
    expect(deps.executeFlow).toHaveBeenCalledWith('main', { playerInput: '攻击哥布林' });

    const r3 = await gen.next(undefined);
    expect(r3.value).toEqual({ type: 'end', message: undefined });
  });

  it('Prompt can write state directly without executing a flow', async () => {
    const deps = makeDeps();
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'name', type: 'Prompt', stateKey: 'playerName', promptText: '输入名字', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const gen = runSession(session, deps);
    expect((await gen.next()).value).toEqual({ type: 'prompt', stepId: 'name', promptText: '输入名字' });
    expect((await gen.next('亚瑟')).value).toEqual({ type: 'end', message: undefined });
    expect(deps.setState).toHaveBeenCalledWith('playerName', '亚瑟');
    expect(deps.executeFlow).not.toHaveBeenCalled();
  });

  it('Branch evaluates conditions and jumps', async () => {
    const state: Record<string, StateValue> = {
      health: { type: 'number', value: 0 },
    };

    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'check', type: 'Branch', conditions: [
          { when: 'state.health <= 0', next: 'death' },
        ], default: 'turn' },
        { id: 'death', type: 'End', message: '你死了' },
        { id: 'turn', type: 'End', message: '继续' },
      ],
    };

    const deps = makeDeps({ getState: () => state });
    const gen = runSession(session, deps);

    const r1 = await gen.next();
    expect(r1.value).toEqual({ type: 'end', message: '你死了' });
  });

  it('Branch falls through to default when no condition matches', async () => {
    const state: Record<string, StateValue> = {
      health: { type: 'number', value: 50 },
    };

    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'check', type: 'Branch', conditions: [
          { when: 'state.health <= 0', next: 'death' },
        ], default: 'alive' },
        { id: 'death', type: 'End', message: '你死了' },
        { id: 'alive', type: 'End', message: '还活着' },
      ],
    };

    const deps = makeDeps({ getState: () => state });
    const gen = runSession(session, deps);

    const r1 = await gen.next();
    expect(r1.value).toEqual({ type: 'end', message: '还活着' });
  });

  it('End step yields end event with message', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'end', type: 'End', message: '游戏结束' },
      ],
    };

    const gen = runSession(session, makeDeps());
    const r1 = await gen.next();
    expect(r1.value).toEqual({ type: 'end', message: '游戏结束' });
    expect((await gen.next()).done).toBe(true);
  });

  it('Prompt returns early when undefined input (EOF)', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'turn', type: 'Prompt', flowRef: 'main', inputChannel: 'playerInput', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const gen = runSession(session, makeDeps());
    const r1 = await gen.next();
    expect(r1.value!.type).toBe('prompt');

    // Send undefined — simulates EOF
    const r2 = await gen.next(undefined);
    expect(r2.done).toBe(true);
  });

  it('yields error when executeFlow throws', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const deps = makeDeps({
      executeFlow: vi.fn(async () => { throw new Error('LLM timeout'); }),
    });
    const gen = runSession(session, deps);

    const r1 = await gen.next();
    expect(r1.value).toEqual({ type: 'error', stepId: 'intro', message: 'LLM timeout' });
    expect((await gen.next()).done).toBe(true);
  });

  it('full lifecycle: intro → loop → branch → outro → end', async () => {
    let turnCount = 0;
    const stateRef: Record<string, StateValue> = {
      health: { type: 'number', value: 100 },
      questStage: { type: 'string', value: 'in_progress' },
    };

    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'turn' },
        { id: 'turn', type: 'Prompt', flowRef: 'main', inputChannel: 'playerInput', next: 'check' },
        { id: 'check', type: 'Branch', conditions: [
          { when: 'state.health <= 0', next: 'death' },
          { when: "state.questStage == 'completed'", next: 'victory' },
        ], default: 'turn' },
        { id: 'death', type: 'RunFlow', flowRef: 'outro-death', next: 'end' },
        { id: 'victory', type: 'RunFlow', flowRef: 'outro-win', next: 'end' },
        { id: 'end', type: 'End' },
      ],
    };

    const deps = makeDeps({
      executeFlow: vi.fn(async (flowId: string) => {
        if (flowId === 'main') {
          turnCount++;
          if (turnCount >= 2) {
            stateRef.questStage = { type: 'string', value: 'completed' };
          }
        }
        return makeResult(flowId, { result: `output-${flowId}` });
      }),
      getState: () => stateRef,
    });

    const gen = runSession(session, deps);
    const events: any[] = [];

    // intro → output
    let r = await gen.next();
    events.push(r.value);

    // turn 1 → prompt
    r = await gen.next(undefined);
    events.push(r.value);
    expect(r.value!.type).toBe('prompt');

    // send input → output
    r = await gen.next('探索洞穴');
    events.push(r.value);
    expect(r.value!.type).toBe('output');

    // check → branch → default → turn (prompt again)
    r = await gen.next(undefined);
    events.push(r.value);
    expect(r.value!.type).toBe('prompt');

    // turn 2 → triggers questStage = completed
    r = await gen.next('击败Boss');
    events.push(r.value);

    // check → branch → victory
    r = await gen.next(undefined);
    events.push(r.value);
    expect(r.value!.type).toBe('output');
    expect(r.value!.stepId).toBe('victory');

    // end
    r = await gen.next(undefined);
    events.push(r.value);
    expect(r.value!.type).toBe('end');
  });

  it('uses entryStep when specified', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      entryStep: 'custom-start',
      steps: [
        { id: 'unused', type: 'End', message: 'wrong' },
        { id: 'custom-start', type: 'End', message: 'correct' },
      ],
    };

    const gen = runSession(session, makeDeps());
    const r = await gen.next();
    expect(r.value).toEqual({ type: 'end', message: 'correct' });
  });

  it('yields error for unknown step reference', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'nonexistent' },
      ],
    };

    const gen = runSession(session, makeDeps());
    // intro output
    await gen.next();
    // next step not found
    const r = await gen.next(undefined);
    expect(r.value!.type).toBe('error');
    expect((r.value as any).message).toContain('nonexistent');
  });

  it('Choice yields choice event, receives selection, then yields output', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          promptText: '选择种族',
          options: [
            { label: '人类', value: 'human' },
            { label: '精灵', value: 'elf' },
          ],
          flowRef: 'save-race',
          inputChannel: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    };

    const deps = makeDeps();
    const gen = runSession(session, deps);

    const r1 = await gen.next();
    expect(r1.value).toEqual({
      type: 'choice',
      stepId: 'choose',
      promptText: '选择种族',
      options: [
        { label: '人类', value: 'human' },
        { label: '精灵', value: 'elf' },
      ],
    });

    const r2 = await gen.next('elf');
    expect(r2.value).toEqual({ type: 'output', stepId: 'choose', data: { result: 'output-from-save-race' } });
    expect(deps.executeFlow).toHaveBeenCalledWith('save-race', { race: 'elf' });

    const r3 = await gen.next(undefined);
    expect(r3.value).toEqual({ type: 'end', message: undefined });
  });

  it('Choice can write state directly without executing a flow', async () => {
    const deps = makeDeps();
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose-race',
          type: 'Choice',
          promptText: '选择种族',
          options: [
            { label: '人类', value: 'human' },
            { label: '精灵', value: 'elf' },
          ],
          stateKey: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    };

    const gen = runSession(session, deps);
    expect((await gen.next()).value).toEqual({
      type: 'choice',
      stepId: 'choose-race',
      promptText: '选择种族',
      options: [
        { label: '人类', value: 'human' },
        { label: '精灵', value: 'elf' },
      ],
    });
    expect((await gen.next('elf')).value).toEqual({ type: 'end', message: undefined });
    expect(deps.setState).toHaveBeenCalledWith('race', 'elf');
    expect(deps.executeFlow).not.toHaveBeenCalled();
  });

  it('Choice returns early when undefined input (EOF)', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          promptText: '选择种族',
          options: [{ label: '人类', value: 'human' }],
          flowRef: 'save-race',
          inputChannel: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    };

    const gen = runSession(session, makeDeps());
    const r1 = await gen.next();
    expect(r1.value!.type).toBe('choice');

    const r2 = await gen.next(undefined);
    expect(r2.done).toBe(true);
  });

  it('Choice yields error when executeFlow throws', async () => {
    const session: SessionDefinition = {
      schemaVersion: '1.0.0',
      steps: [
        {
          id: 'choose',
          type: 'Choice',
          promptText: '选择种族',
          options: [{ label: '人类', value: 'human' }],
          flowRef: 'save-race',
          inputChannel: 'race',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ],
    };

    const deps = makeDeps({
      executeFlow: vi.fn(async () => { throw new Error('flow failed'); }),
    });
    const gen = runSession(session, deps);

    await gen.next(); // choice event
    const r2 = await gen.next('human');
    expect(r2.value).toEqual({ type: 'error', stepId: 'choose', message: 'flow failed' });
    expect((await gen.next()).done).toBe(true);
  });
});
