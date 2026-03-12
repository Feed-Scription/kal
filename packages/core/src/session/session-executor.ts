/**
 * Session executor — AsyncGenerator adapter built on top of the shared session runner
 */

import type { FlowExecutionResult } from '../flow/flow-executor';
import type { StateValue } from '../types/types';
import type { SessionDefinition } from '../types/session';
import {
  advanceSession,
  createSessionCursor,
  type SessionRunnerDeps,
} from './session-runner';

export type SessionEvent =
  | { type: 'output'; stepId: string; data: Record<string, any> }
  | { type: 'prompt'; stepId: string; promptText?: string }
  | { type: 'choice'; stepId: string; promptText: string; options: Array<{ label: string; value: string }> }
  | { type: 'error'; stepId: string; message: string }
  | { type: 'end'; message?: string };

export interface SessionExecutorDeps extends SessionRunnerDeps {
  executeFlow(flowId: string, inputData?: Record<string, any>): Promise<FlowExecutionResult>;
  getState(): Record<string, StateValue>;
  setState(key: string, value: any): void;
}

export async function* runSession(
  session: SessionDefinition,
  deps: SessionExecutorDeps,
): AsyncGenerator<SessionEvent, void, string | undefined> {
  let cursor = createSessionCursor(session);
  let pendingInput: string | undefined;

  while (true) {
    const result = await advanceSession(session, deps, cursor, {
      mode: 'continue',
      userInput: pendingInput,
    });

    pendingInput = undefined;
    cursor = result.cursor;

    for (const event of result.events) {
      if (event.type === 'output') {
        yield { type: 'output', stepId: event.stepId, data: event.data };
        continue;
      }
      yield { type: 'end', message: event.message };
    }

    if (result.status === 'ended') {
      return;
    }

    if (result.status === 'error') {
      yield {
        type: 'error',
        stepId: result.diagnostic?.stepId ?? cursor.currentStepId ?? '',
        message: result.diagnostic?.message ?? 'Session execution failed',
      };
      return;
    }

    if (result.status === 'waiting_input') {
      const waiting = result.waitingFor!;
      const userInput: string | undefined = waiting.kind === 'prompt'
        ? yield {
            type: 'prompt',
            stepId: waiting.stepId,
            promptText: waiting.promptText,
          }
        : yield {
            type: 'choice',
            stepId: waiting.stepId,
            promptText: waiting.promptText ?? '',
            options: waiting.options ?? [],
          };

      if (userInput === undefined) {
        return;
      }

      pendingInput = userInput;
      continue;
    }
  }
}
