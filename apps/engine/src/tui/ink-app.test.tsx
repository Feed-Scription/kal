import type { SessionEvent, StateValue } from '@kal-ai/core';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { resolveBuiltinCommand, resolveChoiceSubmission } from './controls';
import { createPlayerInputEntry, getFooterHint, getGenerationStatus, InkTuiApp } from './ink-app';

function flushRender(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
          promptText: 'Your action?',
        };
      },
    });

    const app = render(<InkTuiApp runtime={runtime} autoExit={false} />);
    await flushRender();

    expect(app.lastFrame()).toContain('Your action?');
    expect(app.lastFrame()).toContain('KAL-AI Play');
    expect(app.lastFrame()).toContain('Ink-powered quest');
    expect(app.lastFrame()).toContain('Type and press Enter');

    app.unmount();
  });

  it('renders zh-CN locale when specified', async () => {
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

    const app = render(<InkTuiApp runtime={runtime} autoExit={false} locale="zh-CN" />);
    await flushRender();

    expect(app.lastFrame()).toContain('你的行动？');
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

    // Default locale (en)
    expect(getFooterHint(null)).toBe('Session ended');
    expect(getFooterHint({
      kind: 'prompt',
      stepId: 'turn',
      promptText: 'Your action?',
    })).toContain('Type and press Enter');
    expect(getFooterHint({
      kind: 'choice',
      stepId: 'class',
      promptText: 'Choose class',
      options: [{ label: 'Warrior', value: 'warrior' }],
    })).toContain('Arrow keys to select');
    expect(getGenerationStatus(0)).toEqual({
      hint: 'Generating |',
      body: 'Please wait, generating next content |',
    });
    expect(getGenerationStatus(3)).toEqual({
      hint: 'Generating \\',
      body: 'Please wait, generating next content \\',
    });

    // zh-CN locale
    expect(getFooterHint(null, 'zh-CN')).toBe('会话已结束');
    expect(getGenerationStatus(0, 'zh-CN')).toEqual({
      hint: '正在生成中 |',
      body: '请稍候，正在生成下一段内容 |',
    });

    expect(createPlayerInputEntry({
      kind: 'prompt',
      stepId: 'turn',
      promptText: 'Your action?',
    }, 'attack')).toEqual({
      kind: 'input',
      title: 'Your action?',
      body: 'attack',
    });

    expect(createPlayerInputEntry({
      kind: 'choice',
      stepId: 'class',
      promptText: 'Choose class',
      options: [{ label: 'Warrior', value: 'warrior' }],
    }, 'Warrior')).toEqual({
      kind: 'input',
      title: 'Choose class',
      body: 'Warrior',
    });

    // Fallback titles when promptText is undefined
    expect(createPlayerInputEntry({
      kind: 'prompt',
      stepId: 'turn',
    }, 'attack')).toEqual({
      kind: 'input',
      title: 'Your input',
      body: 'attack',
    });

    expect(createPlayerInputEntry({
      kind: 'choice',
      stepId: 'class',
      options: [{ label: 'Warrior', value: 'warrior' }],
    }, 'Warrior')).toEqual({
      kind: 'input',
      title: 'Your choice',
      body: 'Warrior',
    });
  });

  it('generator survives across re-renders (Bug 1 fix)', async () => {
    let nextCalls = 0;
    let returnCalled = false;

    const runtime = createRuntimeStub({
      state: {},
      createSession: async function* () {
        nextCalls++;
        yield {
          type: 'prompt' as const,
          stepId: 'turn-1',
          promptText: 'Round 1',
        };
        nextCalls++;
        yield {
          type: 'prompt' as const,
          stepId: 'turn-2',
          promptText: 'Round 2',
        };
        returnCalled = true;
      },
    });

    const app = render(<InkTuiApp runtime={runtime} autoExit={false} />);
    await flushRender();

    expect(nextCalls).toBe(1);
    expect(app.lastFrame()).toContain('Round 1');

    // Type text (each write = one keypress event in Ink)
    app.stdin.write('h');
    await flushRender();
    // Press Enter separately
    app.stdin.write('\r');
    await flushRender(20);

    expect(nextCalls).toBe(2);
    expect(app.lastFrame()).toContain('Round 2');
    expect(returnCalled).toBe(false);

    app.unmount();
  });

  it('Ctrl+C exits cleanly without post-unmount state updates (Bug 2+5 fix)', async () => {
    const generatorReturn = vi.fn();

    const runtime = createRuntimeStub({
      state: {},
      createSession: async function* () {
        try {
          yield {
            type: 'prompt' as const,
            stepId: 'turn',
            promptText: 'Your action?',
          };
        } finally {
          generatorReturn();
        }
      },
    });

    const app = render(<InkTuiApp runtime={runtime} autoExit={false} />);
    await flushRender();

    expect(app.lastFrame()).toContain('Your action?');

    // Ctrl+C
    app.stdin.write('\x03');
    await flushRender();
    await flushRender();

    expect(app.lastFrame()).toContain('Goodbye');
    expect(generatorReturn).toHaveBeenCalled();

    // Second Ctrl+C should be a no-op (shouldExit guard)
    generatorReturn.mockClear();
    app.stdin.write('\x03');
    await flushRender();

    app.unmount();
  });

  it('arrow keys work in choice mode even after typing text (Bug 3 fix)', async () => {
    const runtime = createRuntimeStub({
      state: {},
      createSession: async function* () {
        yield {
          type: 'choice' as const,
          stepId: 'class',
          promptText: 'Choose class',
          options: [
            { label: 'Warrior', value: 'warrior' },
            { label: 'Mage', value: 'mage' },
            { label: 'Rogue', value: 'rogue' },
          ],
        };
      },
    });

    const app = render(<InkTuiApp runtime={runtime} autoExit={false} />);
    await flushRender();

    expect(app.lastFrame()).toContain('Choose class');

    // Type some text first (individual writes = individual keypress events)
    app.stdin.write('a');
    app.stdin.write('b');
    app.stdin.write('c');
    await flushRender();

    // Down arrow should still work and clear the text input
    app.stdin.write('\x1B[B');
    await flushRender();

    // The second option (Mage) should now be highlighted
    const frame = app.lastFrame()!;
    // Verify Mage line has the '>' indicator
    const lines = frame.split('\n');
    const mageLine = lines.find((l) => l.includes('Mage'));
    expect(mageLine).toContain('>');

    app.unmount();
  });

  it('/state command in choice mode executes only once (Bug 4 fix)', async () => {
    let stateCallCount = 0;

    const runtime = createRuntimeStub({
      state: { hp: { type: 'number', value: 42 } },
      createSession: async function* () {
        yield {
          type: 'choice' as const,
          stepId: 'class',
          promptText: 'Choose class',
          options: [
            { label: 'Warrior', value: 'warrior' },
            { label: 'Mage', value: 'mage' },
          ],
        };
      },
    });

    const originalGetState = runtime.getState.bind(runtime);
    runtime.getState = () => {
      stateCallCount++;
      return originalGetState();
    };

    const app = render(<InkTuiApp runtime={runtime} autoExit={false} />);
    await flushRender();

    stateCallCount = 0;

    // Type /state character by character, then press Enter
    for (const ch of '/state') {
      app.stdin.write(ch);
    }
    await flushRender();
    app.stdin.write('\r');
    await flushRender(20);

    expect(stateCallCount).toBe(1);
    expect(app.lastFrame()).toContain('Current state');

    app.unmount();
  });
});
