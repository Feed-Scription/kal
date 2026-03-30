import { describe, expect, it } from 'vitest';
import type { SessionTraceOutputEvent, StateValue } from '@kal-ai/core';
import { toRunEvent } from './run-views';

function createState(value: Record<string, unknown>): Record<string, StateValue> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      const type = Array.isArray(entryValue) ? 'array' : typeof entryValue;
      return [key, { type, value: entryValue }];
    }),
  ) as Record<string, StateValue>;
}

describe('run views', () => {
  it('extracts narrative text from output events', () => {
    const event: SessionTraceOutputEvent = {
      type: 'output',
      stepId: 'turn',
      data: {
        result: {
          narrative: '你推开镇长府厚重的木门。',
          stateChanges: {},
        },
      },
      stateBefore: createState({ currentLocation: '广场' }),
      stateAfter: createState({ currentLocation: '镇长府邸' }),
    };

    const runEvent = toRunEvent(event);
    expect(runEvent.type).toBe('output');
    if (runEvent.type !== 'output') {
      throw new Error('Expected output event');
    }
    expect(runEvent.normalized.narration).toBe('你推开镇长府厚重的木门。');
  });

  it('extracts narration text from output events', () => {
    const event: SessionTraceOutputEvent = {
      type: 'output',
      stepId: 'turn',
      data: {
        result: {
          narration: '你扶稳摇晃的灯塔扶梯。',
          stateChanges: {},
        },
      },
      stateBefore: createState({ night: 1 }),
      stateAfter: createState({ night: 2 }),
    };

    const runEvent = toRunEvent(event);
    expect(runEvent.type).toBe('output');
    if (runEvent.type !== 'output') {
      throw new Error('Expected output event');
    }
    expect(runEvent.normalized.narration).toBe('你扶稳摇晃的灯塔扶梯。');
  });
});
