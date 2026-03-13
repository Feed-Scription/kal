/**
 * Tests for State schema constraints (B5)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateStore } from '../../state-store';
import type { InitialState } from '../../types/types';

describe('StateStore constraints', () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  it('应该在 loadInitialState 时保存 min/max 约束', () => {
    const initialState: InitialState = {
      mood: { type: 'number', value: 50, min: 0, max: 100 },
      ap: { type: 'number', value: 3, min: 0, max: 3 },
    };

    store.loadInitialState(initialState);
    expect(store.get('mood').value?.value).toBe(50);
    expect(store.get('ap').value?.value).toBe(3);
  });

  it('modify 应该 clamp 数值到 min', () => {
    store.loadInitialState({
      mood: { type: 'number', value: 50, min: 0, max: 100 },
    });

    const result = store.modify('mood', -10);
    expect(result.success).toBe(true);
    expect(store.get('mood').value?.value).toBe(0);
  });

  it('modify 应该 clamp 数值到 max', () => {
    store.loadInitialState({
      mood: { type: 'number', value: 50, min: 0, max: 100 },
    });

    const result = store.modify('mood', 150);
    expect(result.success).toBe(true);
    expect(store.get('mood').value?.value).toBe(100);
  });

  it('modify 合法值不应被 clamp', () => {
    store.loadInitialState({
      mood: { type: 'number', value: 50, min: 0, max: 100 },
    });

    const result = store.modify('mood', 75);
    expect(result.success).toBe(true);
    expect(store.get('mood').value?.value).toBe(75);
  });

  it('upsert 应该 clamp 数值', () => {
    store.loadInitialState({
      mood: { type: 'number', value: 50, min: 0, max: 100 },
    });

    const result = store.upsert('mood', 'number', -5);
    expect(result.success).toBe(true);
    expect(store.get('mood').value?.value).toBe(0);
  });

  it('应该在 loadInitialState 时保存 enum 约束', () => {
    store.loadInitialState({
      phase: { type: 'string', value: 'day', enum: ['day', 'night', 'night_done'] },
    });

    expect(store.get('phase').value?.value).toBe('day');
  });

  it('modify 应该拒绝不在 enum 中的值', () => {
    store.loadInitialState({
      phase: { type: 'string', value: 'day', enum: ['day', 'night', 'night_done'] },
    });

    const result = store.modify('phase', 'invalid');
    expect(result.success).toBe(true);
    // Falls back to first enum value
    expect(store.get('phase').value?.value).toBe('day');
  });

  it('modify 应该接受 enum 中的值', () => {
    store.loadInitialState({
      phase: { type: 'string', value: 'day', enum: ['day', 'night', 'night_done'] },
    });

    const result = store.modify('phase', 'night');
    expect(result.success).toBe(true);
    expect(store.get('phase').value?.value).toBe('night');
  });

  it('没有约束的 key 不应被影响', () => {
    store.loadInitialState({
      name: { type: 'string', value: 'Alice' },
      score: { type: 'number', value: 0 },
    });

    store.modify('name', 'Bob');
    store.modify('score', -100);

    expect(store.get('name').value?.value).toBe('Bob');
    expect(store.get('score').value?.value).toBe(-100);
  });
});
