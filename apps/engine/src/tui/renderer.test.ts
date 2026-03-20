import { describe, expect, it } from 'vitest';
import {
  createOutputViewModel,
  createStateRows,
  formatStateValueText,
  renderError,
  renderHelp,
  renderOutput,
  renderStateTable,
  renderWelcome,
} from './renderer';

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('tui renderer', () => {
  it('extracts primary text and state changes from structured output', () => {
    const viewModel = createOutputViewModel({
      reply: {
        narrative: 'A goblin lunges from the shadows.',
        stateChanges: {
          health: 8,
          status: 'wounded',
        },
      },
    });

    expect(viewModel.primaryText).toBe('A goblin lunges from the shadows.');
    expect(viewModel.stateChanges).toEqual([
      { key: 'health', value: 8 },
      { key: 'status', value: 'wounded' },
    ]);

    const rendered = stripAnsi(renderOutput({
      reply: {
        narrative: 'A goblin lunges from the shadows.',
        stateChanges: {
          health: 8,
          status: 'wounded',
        },
      },
    }));

    expect(rendered).toContain('A goblin lunges from the shadows.');
    expect(rendered).toContain('状态变化');
    expect(rendered).toContain('health');
    expect(rendered).toContain('status');
  });

  it('falls back to JSON for unstructured objects', () => {
    const viewModel = createOutputViewModel({
      reply: {
        score: 42,
        reward: 'amulet',
      },
    });

    expect(viewModel.fallback).toContain('"score": 42');
    expect(viewModel.fallback).toContain('"reward": "amulet"');
  });

  it('renders state rows and state table', () => {
    const rows = createStateRows({
      health: { type: 'number', value: 10 },
      inventory: { type: 'array', value: ['potion', 'map'] },
    });

    expect(rows).toEqual([
      { key: 'health', type: 'number', value: 10 },
      { key: 'inventory', type: 'array', value: ['potion', 'map'] },
    ]);

    const table = stripAnsi(renderStateTable({
      health: { type: 'number', value: 10 },
      inventory: { type: 'array', value: ['potion', 'map'] },
    }));

    expect(table).toContain('当前状态');
    expect(table).toContain('health (number): 10');
    expect(table).toContain('inventory (array): [potion, map]');
  });

  it('renders the shared shell copy', () => {
    expect(stripAnsi(renderWelcome('Demo', 'Adventure time'))).toContain('KAL-AI Play');
    expect(stripAnsi(renderWelcome('Demo', 'Adventure time'))).toContain('Adventure time');
    expect(stripAnsi(renderHelp())).toContain('/state');
    expect(stripAnsi(renderError('boom'))).toContain('boom');
    expect(formatStateValueText({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });
});
