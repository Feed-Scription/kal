import { describe, it, expect } from 'vitest';
import { parseCondition, evaluateCondition } from '../../session/condition-evaluator';
import type { StateValue } from '../../types/types';

describe('parseCondition', () => {
  it('parses number comparison', () => {
    const result = parseCondition('state.health <= 0');
    expect(result).toEqual({ stateKey: 'health', operator: '<=', literal: 0 });
  });

  it('parses string comparison with single quotes', () => {
    const result = parseCondition("state.questStage == 'completed'");
    expect(result).toEqual({ stateKey: 'questStage', operator: '==', literal: 'completed' });
  });

  it('parses string comparison with double quotes', () => {
    const result = parseCondition('state.questStage != "failed"');
    expect(result).toEqual({ stateKey: 'questStage', operator: '!=', literal: 'failed' });
  });

  it('parses boolean literal', () => {
    const result = parseCondition('state.isDead == true');
    expect(result).toEqual({ stateKey: 'isDead', operator: '==', literal: true });
  });

  it('parses null literal', () => {
    const result = parseCondition('state.target == null');
    expect(result).toEqual({ stateKey: 'target', operator: '==', literal: null });
  });

  it('parses > operator', () => {
    const result = parseCondition('state.gold > 100');
    expect(result).toEqual({ stateKey: 'gold', operator: '>', literal: 100 });
  });

  it('parses >= operator', () => {
    const result = parseCondition('state.level >= 5');
    expect(result).toEqual({ stateKey: 'level', operator: '>=', literal: 5 });
  });

  it('parses < operator', () => {
    const result = parseCondition('state.health < 10');
    expect(result).toEqual({ stateKey: 'health', operator: '<', literal: 10 });
  });

  it('throws on invalid expression', () => {
    expect(() => parseCondition('health <= 0')).toThrow('Invalid condition expression');
  });

  it('throws on missing operator', () => {
    expect(() => parseCondition('state.health')).toThrow('Invalid condition expression');
  });

  it('throws on invalid literal', () => {
    expect(() => parseCondition('state.health == abc')).toThrow('Invalid literal');
  });
});

describe('evaluateCondition', () => {
  const state: Record<string, StateValue> = {
    health: { type: 'number', value: 50 },
    gold: { type: 'number', value: 100 },
    questStage: { type: 'string', value: 'completed' },
    isDead: { type: 'boolean', value: false },
  };

  it('evaluates number <= (false)', () => {
    expect(evaluateCondition('state.health <= 0', state)).toBe(false);
  });

  it('evaluates number <= (true)', () => {
    const dying = { ...state, health: { type: 'number' as const, value: 0 } };
    expect(evaluateCondition('state.health <= 0', dying)).toBe(true);
  });

  it('evaluates string == (true)', () => {
    expect(evaluateCondition("state.questStage == 'completed'", state)).toBe(true);
  });

  it('evaluates string == (false)', () => {
    expect(evaluateCondition("state.questStage == 'failed'", state)).toBe(false);
  });

  it('evaluates != (true)', () => {
    expect(evaluateCondition("state.questStage != 'failed'", state)).toBe(true);
  });

  it('evaluates > (true)', () => {
    expect(evaluateCondition('state.gold > 50', state)).toBe(true);
  });

  it('evaluates >= (true, equal)', () => {
    expect(evaluateCondition('state.gold >= 100', state)).toBe(true);
  });

  it('evaluates < (false)', () => {
    expect(evaluateCondition('state.gold < 100', state)).toBe(false);
  });

  it('evaluates boolean == false', () => {
    expect(evaluateCondition('state.isDead == false', state)).toBe(true);
  });

  it('returns false when state key does not exist', () => {
    expect(evaluateCondition('state.nonExistent == 0', state)).toBe(false);
  });

  it('parses state.key.length expression', () => {
    const result = parseCondition('state.history.length >= 20');
    expect(result).toEqual({ stateKey: 'history.length', operator: '>=', literal: 20 });
  });

  it('evaluates state.key.length >= (true)', () => {
    const stateWithHistory = {
      ...state,
      history: { type: 'array' as const, value: new Array(25).fill({ role: 'user', content: 'test' }) },
    };
    expect(evaluateCondition('state.history.length >= 20', stateWithHistory)).toBe(true);
  });

  it('evaluates state.key.length >= (false)', () => {
    const stateWithHistory = {
      ...state,
      history: { type: 'array' as const, value: [{ role: 'user', content: 'test' }] },
    };
    expect(evaluateCondition('state.history.length >= 20', stateWithHistory)).toBe(false);
  });

  it('evaluates state.key.length == (true)', () => {
    const stateWithHistory = {
      ...state,
      history: { type: 'array' as const, value: [1, 2, 3] },
    };
    expect(evaluateCondition('state.history.length == 3', stateWithHistory)).toBe(true);
  });

  it('returns 0 for .length on non-array values', () => {
    expect(evaluateCondition('state.health.length == 0', state)).toBe(true);
  });
});
