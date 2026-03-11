/**
 * Session executor — AsyncGenerator state machine that orchestrates DAG flows
 */

import type { FlowExecutionResult } from '../flow/flow-executor';
import type { StateValue } from '../types/types';
import type { SessionDefinition, SessionStep } from '../types/session';
import { evaluateCondition } from './condition-evaluator';

export type SessionEvent =
  | { type: 'output'; stepId: string; data: Record<string, any> }
  | { type: 'prompt'; stepId: string; promptText?: string }
  | { type: 'choice'; stepId: string; promptText: string; options: Array<{ label: string; value: string }> }
  | { type: 'error'; stepId: string; message: string }
  | { type: 'end'; message?: string };

export interface SessionExecutorDeps {
  executeFlow(flowId: string, inputData?: Record<string, any>): Promise<FlowExecutionResult>;
  getState(): Record<string, StateValue>;
  setState(key: string, value: any): void;
}

export async function* runSession(
  session: SessionDefinition,
  deps: SessionExecutorDeps,
): AsyncGenerator<SessionEvent, void, string | undefined> {
  const stepsById = new Map<string, SessionStep>();
  for (const step of session.steps) {
    stepsById.set(step.id, step);
  }

  const entryId = session.entryStep ?? session.steps[0]?.id;
  if (!entryId) {
    yield { type: 'error', stepId: '', message: 'Session has no steps' };
    return;
  }

  let currentId: string | undefined = entryId;

  while (currentId) {
    const step = stepsById.get(currentId);
    if (!step) {
      yield { type: 'error', stepId: currentId, message: `Step not found: ${currentId}` };
      return;
    }

    switch (step.type) {
      case 'RunFlow': {
        try {
          const result = await deps.executeFlow(step.flowRef);
          yield { type: 'output', stepId: step.id, data: result.outputs };
        } catch (error) {
          yield { type: 'error', stepId: step.id, message: (error as Error).message };
          return;
        }
        currentId = step.next;
        break;
      }

      case 'Prompt': {
        const userInput: string | undefined = yield {
          type: 'prompt',
          stepId: step.id,
          promptText: step.promptText,
        };

        if (userInput === undefined) {
          // Generator was returned without input — treat as session end
          return;
        }

        if (step.stateKey) {
          try {
            deps.setState(step.stateKey, userInput);
          } catch (error) {
            yield { type: 'error', stepId: step.id, message: (error as Error).message };
            return;
          }
        }

        if (!step.flowRef) {
          currentId = step.next;
          break;
        }

        try {
          const result = await deps.executeFlow(step.flowRef, {
            [step.inputChannel!]: userInput,
          });
          yield { type: 'output', stepId: step.id, data: result.outputs };
        } catch (error) {
          yield { type: 'error', stepId: step.id, message: (error as Error).message };
          return;
        }
        currentId = step.next;
        break;
      }

      case 'Branch': {
        const state = deps.getState();
        let matched = false;
        for (const cond of step.conditions) {
          try {
            if (evaluateCondition(cond.when, state)) {
              currentId = cond.next;
              matched = true;
              break;
            }
          } catch (error) {
            yield { type: 'error', stepId: step.id, message: (error as Error).message };
            return;
          }
        }
        if (!matched) {
          currentId = step.default;
        }
        break;
      }

      case 'Choice': {
        const userChoice: string | undefined = yield {
          type: 'choice',
          stepId: step.id,
          promptText: step.promptText,
          options: step.options,
        };

        if (userChoice === undefined) {
          return;
        }

        if (step.stateKey) {
          try {
            deps.setState(step.stateKey, userChoice);
          } catch (error) {
            yield { type: 'error', stepId: step.id, message: (error as Error).message };
            return;
          }
        }

        if (!step.flowRef) {
          currentId = step.next;
          break;
        }

        try {
          const result = await deps.executeFlow(step.flowRef, {
            [step.inputChannel!]: userChoice,
          });
          yield { type: 'output', stepId: step.id, data: result.outputs };
        } catch (error) {
          yield { type: 'error', stepId: step.id, message: (error as Error).message };
          return;
        }
        currentId = step.next;
        break;
      }

      case 'End': {
        yield { type: 'end', message: step.message };
        return;
      }

      default: {
        yield {
          type: 'error',
          stepId: (step as SessionStep).id,
          message: `Unknown step type: ${(step as any).type}`,
        };
        return;
      }
    }
  }
}
