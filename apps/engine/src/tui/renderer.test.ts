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
    expect(rendered).toContain('State changes');
    expect(rendered).toContain('health');
    expect(rendered).toContain('status');
  });

  it('renders zh-CN state changes label when locale is zh-CN', () => {
    const rendered = stripAnsi(renderOutput({
      reply: {
        narrative: 'A goblin attacks.',
        stateChanges: { health: 5 },
      },
    }, 'zh-CN'));

    expect(rendered).toContain('状态变化');
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

    expect(table).toContain('Current state');
    expect(table).toContain('health (number): 10');
    expect(table).toContain('inventory (array): [potion, map]');
  });

  it('parses JSON string output into structured narrative and stateChanges', () => {
    const viewModel = createOutputViewModel({
      result: JSON.stringify({
        narrative: '你蹲在潮间带的岩石后面',
        stateChanges: { stamina: 62, inventory: ['石块'] },
      }),
    });

    expect(viewModel.primaryText).toBe('你蹲在潮间带的岩石后面');
    expect(viewModel.stateChanges).toEqual([
      { key: 'stamina', value: 62 },
      { key: 'inventory', value: ['石块'] },
    ]);
    expect(viewModel.fallback).toBeUndefined();
  });

  it('accepts narration as the primary text field', () => {
    const viewModel = createOutputViewModel({
      result: {
        narration: '海风卷着盐粒拍在你的脸上。',
        stateChanges: { fuel: 4 },
      },
    });

    expect(viewModel.primaryText).toBe('海风卷着盐粒拍在你的脸上。');
    expect(viewModel.stateChanges).toEqual([
      { key: 'fuel', value: 4 },
    ]);
  });

  it('renders the shared shell copy', () => {
    expect(stripAnsi(renderWelcome('Demo', 'Adventure time'))).toContain('KAL-AI Play');
    expect(stripAnsi(renderWelcome('Demo', 'Adventure time'))).toContain('Adventure time');
    expect(stripAnsi(renderWelcome('Demo', 'Adventure time'))).toContain('Type /help for commands');
    expect(stripAnsi(renderHelp())).toContain('/state');
    expect(stripAnsi(renderHelp())).toContain('Available commands');
    expect(stripAnsi(renderError('boom'))).toContain('Error: boom');
    expect(formatStateValueText({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });

  it('renders zh-CN shell copy when locale is zh-CN', () => {
    expect(stripAnsi(renderWelcome('Demo', 'Adventure time', undefined, 'zh-CN'))).toContain('输入 /help 查看命令');
    expect(stripAnsi(renderHelp('zh-CN'))).toContain('可用命令');
    expect(stripAnsi(renderError('boom', 'zh-CN'))).toContain('错误: boom');
    expect(stripAnsi(renderStateTable({
      health: { type: 'number', value: 10 },
    }, 'zh-CN'))).toContain('当前状态');
  });
});
