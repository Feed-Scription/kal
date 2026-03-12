import type { FlowExecutionResult } from '../flow/flow-executor';
import type { NodeExecutionError } from '../types/errors';
import type { StateValue } from '../types/types';
import type { ChoiceStep, PromptStep, SessionDefinition, SessionStep } from '../types/session';
import { evaluateCondition } from './condition-evaluator';

export type SessionAdvanceMode = 'continue' | 'step';
export type SessionAdvanceStatus = 'waiting_input' | 'paused' | 'ended' | 'error';

export interface SessionCursor {
  currentStepId: string | null;
  stepIndex: number;
}

export interface SessionWaitingFor {
  kind: 'prompt' | 'choice';
  stepId: string;
  promptText?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface SessionTraceOutputEvent {
  type: 'output';
  stepId: string;
  data: Record<string, any>;
  flowId?: string;
  stateBefore: Record<string, StateValue>;
  stateAfter: Record<string, StateValue>;
}

export interface SessionTraceEndEvent {
  type: 'end';
  message?: string;
}

export type SessionTraceEvent = SessionTraceOutputEvent | SessionTraceEndEvent;

export interface SessionAdvanceError {
  code: string;
  message: string;
  stepId?: string;
  flowId?: string;
  nodeId?: string;
  nodeType?: string;
  errorType?: string;
  details?: unknown;
}

export interface SessionRunnerDeps {
  executeFlow(flowId: string, inputData?: Record<string, any>): Promise<FlowExecutionResult>;
  getState(): Record<string, StateValue>;
  setState(key: string, value: any): void;
}

export interface AdvanceSessionOptions {
  mode: SessionAdvanceMode;
  userInput?: string;
}

export interface SessionAdvanceResult {
  cursor: SessionCursor;
  events: SessionTraceEvent[];
  waitingFor: SessionWaitingFor | null;
  status: SessionAdvanceStatus;
  diagnostic?: SessionAdvanceError;
}

export function createSessionCursor(session: SessionDefinition): SessionCursor {
  return {
    currentStepId: session.entryStep ?? session.steps[0]?.id ?? null,
    stepIndex: 0,
  };
}

export async function advanceSession(
  session: SessionDefinition,
  deps: SessionRunnerDeps,
  cursor: SessionCursor,
  options: AdvanceSessionOptions,
): Promise<SessionAdvanceResult> {
  const stepsById = new Map<string, SessionStep>();
  for (const step of session.steps) {
    stepsById.set(step.id, step);
  }

  if (stepsById.size === 0) {
    return buildErrorResult(cursor, [], {
      code: 'SESSION_EMPTY',
      message: 'Session has no steps',
    });
  }

  if (cursor.currentStepId === null) {
    return {
      cursor,
      events: [],
      waitingFor: null,
      status: 'ended',
    };
  }

  const events: SessionTraceEvent[] = [];
  let currentStepId = cursor.currentStepId;
  let stepIndex = cursor.stepIndex;
  let pendingUserInput = options.userInput;

  while (currentStepId) {
    const step = stepsById.get(currentStepId);
    if (!step) {
      return buildErrorResult({ currentStepId, stepIndex }, events, {
        code: 'SESSION_STEP_NOT_FOUND',
        message: `Step not found: ${currentStepId}`,
        stepId: currentStepId,
      });
    }

    if (pendingUserInput !== undefined && step.type !== 'Prompt' && step.type !== 'Choice') {
      return buildErrorResult({ currentStepId, stepIndex }, events, {
        code: 'INPUT_NOT_EXPECTED',
        message: `Step "${step.id}" does not accept input`,
        stepId: step.id,
        details: {
          input: pendingUserInput,
        },
      });
    }

    switch (step.type) {
      case 'RunFlow': {
        const result = await executeStepFlow(step.id, step.flowRef, undefined, deps);
        if ('diagnostic' in result) {
          return buildErrorResult({ currentStepId: step.id, stepIndex }, events, result.diagnostic);
        }
        events.push(result.event);
        currentStepId = step.next;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizeStepResult(currentStepId, stepIndex, events, stepsById);
        }
        break;
      }

      case 'Prompt': {
        if (pendingUserInput === undefined) {
          return {
            cursor: { currentStepId: step.id, stepIndex },
            events,
            waitingFor: buildWaitingFor(step),
            status: 'waiting_input',
          };
        }

        const promptResult = await executeInteractiveStep(step, pendingUserInput, deps);
        pendingUserInput = undefined;
        if ('diagnostic' in promptResult) {
          return buildErrorResult({ currentStepId: step.id, stepIndex }, events, promptResult.diagnostic);
        }
        if (promptResult.event) {
          events.push(promptResult.event);
        }
        currentStepId = step.next;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizeStepResult(currentStepId, stepIndex, events, stepsById);
        }
        break;
      }

      case 'Choice': {
        if (pendingUserInput === undefined) {
          return {
            cursor: { currentStepId: step.id, stepIndex },
            events,
            waitingFor: buildWaitingFor(step),
            status: 'waiting_input',
          };
        }

        const choiceResult = await executeInteractiveStep(step, pendingUserInput, deps);
        pendingUserInput = undefined;
        if ('diagnostic' in choiceResult) {
          return buildErrorResult({ currentStepId: step.id, stepIndex }, events, choiceResult.diagnostic);
        }
        if (choiceResult.event) {
          events.push(choiceResult.event);
        }
        currentStepId = step.next;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizeStepResult(currentStepId, stepIndex, events, stepsById);
        }
        break;
      }

      case 'Branch': {
        const state = deps.getState();
        let nextStepId = step.default;
        try {
          for (const cond of step.conditions) {
            if (evaluateCondition(cond.when, state)) {
              nextStepId = cond.next;
              break;
            }
          }
        } catch (error) {
          return buildErrorResult({ currentStepId: step.id, stepIndex }, events, {
            code: 'CONDITION_EVAL_ERROR',
            message: (error as Error).message,
            stepId: step.id,
            details: {
              condition: step.conditions.map((cond) => cond.when),
            },
          });
        }
        currentStepId = nextStepId;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizeStepResult(currentStepId, stepIndex, events, stepsById);
        }
        break;
      }

      case 'End': {
        events.push({ type: 'end', message: step.message });
        return {
          cursor: { currentStepId: null, stepIndex: stepIndex + 1 },
          events,
          waitingFor: null,
          status: 'ended',
        };
      }
    }
  }

  return {
    cursor: { currentStepId: null, stepIndex },
    events,
    waitingFor: null,
    status: 'ended',
  };
}

function buildWaitingFor(step: PromptStep | ChoiceStep): SessionWaitingFor {
  if (step.type === 'Prompt') {
    return {
      kind: 'prompt',
      stepId: step.id,
      promptText: step.promptText,
    };
  }

  return {
    kind: 'choice',
    stepId: step.id,
    promptText: step.promptText,
    options: step.options,
  };
}

function buildErrorResult(
  cursor: SessionCursor,
  events: SessionTraceEvent[],
  diagnostic: SessionAdvanceError,
): SessionAdvanceResult {
  return {
    cursor,
    events,
    waitingFor: null,
    status: 'error',
    diagnostic,
  };
}

function finalizeStepResult(
  currentStepId: string | null,
  stepIndex: number,
  events: SessionTraceEvent[],
  stepsById: Map<string, SessionStep>,
): SessionAdvanceResult {
  if (currentStepId === null) {
    return {
      cursor: { currentStepId: null, stepIndex },
      events,
      waitingFor: null,
      status: 'ended',
    };
  }

  const nextStep = stepsById.get(currentStepId);
  if (!nextStep) {
    return buildErrorResult({ currentStepId, stepIndex }, events, {
      code: 'SESSION_STEP_NOT_FOUND',
      message: `Step not found: ${currentStepId}`,
      stepId: currentStepId,
    });
  }

  if (nextStep.type === 'Prompt' || nextStep.type === 'Choice') {
    return {
      cursor: { currentStepId, stepIndex },
      events,
      waitingFor: buildWaitingFor(nextStep),
      status: 'waiting_input',
    };
  }

  return {
    cursor: { currentStepId, stepIndex },
    events,
    waitingFor: null,
    status: 'paused',
  };
}

async function executeInteractiveStep(
  step: PromptStep | ChoiceStep,
  userInput: string,
  deps: SessionRunnerDeps,
): Promise<{ event?: SessionTraceOutputEvent } | { diagnostic: SessionAdvanceError }> {
  const stateBefore = deps.getState();

  if (step.stateKey) {
    try {
      deps.setState(step.stateKey, userInput);
    } catch (error) {
      return {
        diagnostic: {
          code: inferStateErrorCode(error),
          message: (error as Error).message,
          stepId: step.id,
          details: {
            input: userInput,
            stateKey: step.stateKey,
          },
        },
      };
    }
  }

  if (!step.flowRef) {
    return {
      event: undefined,
    };
  }

  return executeStepFlow(
    step.id,
    step.flowRef,
    { [step.inputChannel!]: userInput },
    deps,
    stateBefore,
  );
}

async function executeStepFlow(
  stepId: string,
  flowId: string,
  inputData: Record<string, any> | undefined,
  deps: SessionRunnerDeps,
  stateBefore = deps.getState(),
): Promise<{ event: SessionTraceOutputEvent } | { diagnostic: SessionAdvanceError }> {
  let result: FlowExecutionResult;
  try {
    result = await deps.executeFlow(flowId, inputData);
  } catch (error) {
    return {
      diagnostic: buildThrownFlowDiagnostic(stepId, flowId, inputData, error),
    };
  }

  if (result.errors.length > 0) {
    return {
      diagnostic: buildFlowResultDiagnostic(stepId, flowId, inputData, result.errors[0]!, result),
    };
  }

  return {
    event: {
      type: 'output',
      stepId,
      flowId,
      data: result.outputs,
      stateBefore,
      stateAfter: deps.getState(),
    },
  };
}

function buildThrownFlowDiagnostic(
  stepId: string,
  flowId: string,
  inputData: Record<string, any> | undefined,
  error: unknown,
): SessionAdvanceError {
  const typed = error as Error & { code?: string; details?: unknown };
  return {
    code: typed.code ?? 'FLOW_EXECUTION_FAILED',
    message: typed.message,
    stepId,
    flowId,
    details: {
      flowInputs: inputData,
      cause: typed.details,
    },
  };
}

function buildFlowResultDiagnostic(
  stepId: string,
  flowId: string,
  inputData: Record<string, any> | undefined,
  nodeError: NodeExecutionError,
  result: FlowExecutionResult,
): SessionAdvanceError {
  return {
    code: nodeError.errorType === 'timeout' ? 'NODE_TIMEOUT' : 'FLOW_EXECUTION_FAILED',
    message: nodeError.message,
    stepId,
    flowId,
    nodeId: nodeError.nodeId,
    nodeType: nodeError.nodeType,
    errorType: nodeError.errorType,
    details: {
      flowInputs: inputData,
      flowExecutionId: result.executionId,
      flowDurationMs: result.durationMs,
      flowErrors: result.errors,
      flowOutputs: result.outputs,
    },
  };
}

function inferStateErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('does not exist') || message.includes('not found')) {
    return 'STATE_KEY_NOT_FOUND';
  }
  return 'STATE_WRITE_FAILED';
}
