import type { SessionEvent, StateValue } from '@kal-ai/core';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { resolveBuiltinCommand, resolveChoiceSubmission } from './controls';
import { createPlayerInputEntry, getFooterHint, getGenerationStatus, InkTuiApp } from './ink-app';

function flushRender(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createRuntimeStub(params: {
  state: Record<string, StateValue>;
  createSession: () => AsyncGenerator<SessionEvent, void, string | undefined>;
}) {
  return {
    getProjectInfo() {
      return {
        name: 'Test Adventure',
        version: '1.0.0',
        flows: [],
        customNodes: [],
        hasSession: true,
        state: { keys: Object.keys(params.state) },
      };
    },
    getSession() {
      return {
        schemaVersion: '1.0.0',
        name: 'Adventure',
        description: 'Ink-powered quest',
        steps: [],
      };
    },
    getState() {
      return params.state;
    },
    createSession: params.createSession,
  };
}

describe('InkTuiApp', () => {
  it('renders the initial prompt layout', async () => {
    const runtime = createRuntimeStub({
      state: {
        health: { type: 'number', value: 12 },
      },
      createSession: async function* () {
        yield {
          type: 'prompt',
          stepId: 'turn',
          promptText: '你的行动？',
        };
      },
    });

    const app = render(<InkTuiApp runtime={runtime} autoExit={false} />);
    await flushRender();

    expect(app.lastFrame()).toContain('你的行动？');
    expect(app.lastFrame()).toContain('KAL-AI Play');
    expect(app.lastFrame()).toContain('Ink-powered quest');
    expect(app.lastFrame()).toContain('输入文本后回车');

    app.unmount();
  });

  it('resolves built-in commands and choice submissions', () => {
    expect(resolveBuiltinCommand('/help')).toBe('help');
    expect(resolveBuiltinCommand('/state')).toBe('state');
    expect(resolveBuiltinCommand('/quit')).toBe('quit');
    expect(resolveBuiltinCommand('/mystery')).toBeNull();
    expect(resolveBuiltinCommand('attack')).toBeNull();

    expect(resolveChoiceSubmission('', [
      { label: 'Warrior', value: 'warrior' },
      { label: 'Mage', value: 'mage' },
    ], 1)).toEqual({
      kind: 'submit',
      value: 'mage',
    });

    expect(resolveChoiceSubmission('2', [
      { label: 'Warrior', value: 'warrior' },
      { label: 'Mage', value: 'mage' },
    ], 0)).toEqual({
      kind: 'submit',
      value: 'mage',
    });

    expect(resolveChoiceSubmission('/state', [
      { label: 'Warrior', value: 'warrior' },
    ], 0)).toEqual({
      kind: 'command',
      command: 'state',
    });

    expect(resolveChoiceSubmission('01', [
      { label: 'Warrior', value: 'warrior' },
      { label: 'Mage', value: 'mage' },
    ], 0)).toEqual({
      kind: 'submit',
      value: 'warrior',
    });

    expect(resolveChoiceSubmission('9', [
      { label: 'Warrior', value: 'warrior' },
      { label: 'Mage', value: 'mage' },
    ], 0)).toEqual({
      kind: 'invalid',
    });

    expect(getFooterHint(null)).toBe('会话已结束');
    expect(getFooterHint({
      kind: 'prompt',
      stepId: 'turn',
      promptText: '你的行动？',
    })).toContain('输入文本后回车');
    expect(getFooterHint({
      kind: 'choice',
      stepId: 'class',
      promptText: '选择职业',
      options: [{ label: 'Warrior', value: 'warrior' }],
    })).toContain('方向键选择并回车');
    expect(getGenerationStatus(0)).toEqual({
      hint: '正在生成中 |',
      body: '请稍候，正在生成下一段内容 |',
    });
    expect(getGenerationStatus(3)).toEqual({
      hint: '正在生成中 \\',
      body: '请稍候，正在生成下一段内容 \\',
    });

    expect(createPlayerInputEntry({
      kind: 'prompt',
      stepId: 'turn',
      promptText: '你的行动？',
    }, 'attack')).toEqual({
      kind: 'input',
      title: '你的行动？',
      body: 'attack',
    });

    expect(createPlayerInputEntry({
      kind: 'choice',
      stepId: 'class',
      promptText: '选择职业',
      options: [{ label: 'Warrior', value: 'warrior' }],
    }, 'Warrior')).toEqual({
      kind: 'input',
      title: '选择职业',
      body: 'Warrior',
    });
  });
});
