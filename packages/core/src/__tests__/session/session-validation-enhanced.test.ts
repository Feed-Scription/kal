/**
 * Tests for A2: Session validation enhancement
 */

import { describe, it, expect } from 'vitest';
import { validateSessionDefinition } from '../../session/session-loader';

describe('Session validation enhancement', () => {
  const baseSession = (steps: any[]) => ({
    schemaVersion: '1.0',
    steps,
  });

  it('Choice 有 inputChannel 但没有 flowRef 应该报错', () => {
    const errors = validateSessionDefinition(
      baseSession([
        {
          id: 'choice1',
          type: 'Choice',
          promptText: 'Pick one',
          options: [{ label: 'A', value: 'a' }],
          stateKey: 'choice',
          inputChannel: 'userChoice',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ]),
      []
    );

    const inputChannelError = errors.find((e) => e.message.includes('inputChannel requires flowRef'));
    expect(inputChannelError).toBeDefined();
  });

  it('Prompt 有 inputChannel 但没有 flowRef 应该报错', () => {
    const errors = validateSessionDefinition(
      baseSession([
        {
          id: 'prompt1',
          type: 'Prompt',
          stateKey: 'input',
          inputChannel: 'userInput',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ]),
      []
    );

    const inputChannelError = errors.find((e) => e.message.includes('inputChannel requires flowRef'));
    expect(inputChannelError).toBeDefined();
  });

  it('Choice 有 flowRef 和 inputChannel 不应报错', () => {
    const errors = validateSessionDefinition(
      baseSession([
        {
          id: 'choice1',
          type: 'Choice',
          promptText: 'Pick one',
          options: [{ label: 'A', value: 'a' }],
          flowRef: 'my-flow',
          inputChannel: 'userChoice',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ]),
      ['my-flow']
    );

    const inputChannelError = errors.find((e) => e.message.includes('inputChannel requires flowRef'));
    expect(inputChannelError).toBeUndefined();
  });

  it('Choice 只有 stateKey 不应报错', () => {
    const errors = validateSessionDefinition(
      baseSession([
        {
          id: 'choice1',
          type: 'Choice',
          promptText: 'Pick one',
          options: [{ label: 'A', value: 'a' }],
          stateKey: 'choice',
          next: 'end',
        },
        { id: 'end', type: 'End' },
      ]),
      []
    );

    const inputChannelError = errors.find((e) => e.message.includes('inputChannel requires flowRef'));
    expect(inputChannelError).toBeUndefined();
  });
});
