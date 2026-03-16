import type { FlowExecutionResult } from '../flow/flow-executor';
import type { NodeExecutionError } from '../types/errors';
import type { StateValue } from '../types/types';
import type { ChoiceStep, DynamicChoiceStep, PromptStep, SessionDefinition, SessionStep } from '../types/session';
import { readerFromStateRecord } from '../expression/reader';
import { evaluateCondition as evalCondition } from '../expression/predicate';
import type { ConditionSpec } from '../expression/predicate';
import { materializeWaitingFor, NoVisibleOptionsError } from './materializer';

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

export interface SessionInspectionResult {
  cursor: SessionCursor;
  waitingFor: SessionWaitingFor | null;
  status: SessionAdvanceStatus;
  diagnostic?: SessionAdvanceError;
}

export interface SessionPreviewResult {
  cursor: SessionCursor;
  waitingFor: SessionWaitingFor | null;
  status: SessionAdvanceStatus;
  stateAfter: Record<string, StateValue>;
  diagnostic?: SessionAdvanceError;
}

export function createSessionCursor(session: SessionDefinition): SessionCursor {
  return {
    currentStepId: session.entryStep ?? session.steps[0]?.id ?? null,
    stepIndex: 0,
  };
}

export function inspectCurrentSessionStep(
  session: SessionDefinition,
  cursor: SessionCursor,
  state: Record<string, StateValue>,
): SessionInspectionResult {
  const stepsById = createStepsById(session);
  if (stepsById.size === 0) {
    return {
      cursor,
      waitingFor: null,
      status: 'error',
      diagnostic: {
        code: 'SESSION_EMPTY',
        message: 'Session has no steps',
      },
    };
  }

  if (cursor.currentStepId === null) {
    return {
      cursor,
      waitingFor: null,
      status: 'ended',
    };
  }

  const step = stepsById.get(cursor.currentStepId);
  if (!step) {
    return {
      cursor,
      waitingFor: null,
      status: 'error',
      diagnostic: {
        code: 'SESSION_STEP_NOT_FOUND',
        message: `Step not found: ${cursor.currentStepId}`,
        stepId: cursor.currentStepId,
      },
    };
  }

  if (step.type === 'Prompt' || step.type === 'Choice' || step.type === 'DynamicChoice') {
    const reader = readerFromStateRecord(state);
    try {
      return {
        cursor,
        waitingFor: materializeWaitingFor(step, reader),
        status: 'waiting_input',
      };
    } catch (error) {
      if (error instanceof NoVisibleOptionsError) {
        return {
          cursor,
          waitingFor: null,
          status: 'error',
          diagnostic: {
            code: 'NO_VISIBLE_OPTIONS',
            message: 'DynamicChoice has no visible options',
            stepId: step.id,
          },
        };
      }
      throw error;
    }
  }

  return {
    cursor,
    waitingFor: null,
    status: step.type === 'End' ? 'ended' : 'paused',
  };
}

export function previewAdvanceSession(
  session: SessionDefinition,
  cursor: SessionCursor,
  state: Record<string, StateValue>,
  options: AdvanceSessionOptions,
): SessionPreviewResult {
  const stepsById = createStepsById(session);
  if (stepsById.size === 0) {
    return {
      cursor,
      waitingFor: null,
      status: 'error',
      stateAfter: cloneStateRecord(state),
      diagnostic: {
        code: 'SESSION_EMPTY',
        message: 'Session has no steps',
      },
    };
  }

  if (cursor.currentStepId === null) {
    return {
      cursor,
      waitingFor: null,
      status: 'ended',
      stateAfter: cloneStateRecord(state),
    };
  }

  const previewState = cloneStateRecord(state);
  let currentStepId = cursor.currentStepId;
  let stepIndex = cursor.stepIndex;
  let pendingUserInput = options.userInput;

  while (currentStepId) {
    const step = stepsById.get(currentStepId);
    if (!step) {
      return {
        cursor: { currentStepId, stepIndex },
        waitingFor: null,
        status: 'error',
        stateAfter: previewState,
        diagnostic: {
          code: 'SESSION_STEP_NOT_FOUND',
          message: `Step not found: ${currentStepId}`,
          stepId: currentStepId,
        },
      };
    }

    if (pendingUserInput !== undefined && step.type !== 'Prompt' && step.type !== 'Choice' && step.type !== 'DynamicChoice') {
      return {
        cursor: { currentStepId, stepIndex },
        waitingFor: null,
        status: 'error',
        stateAfter: previewState,
        diagnostic: {
          code: 'INPUT_NOT_EXPECTED',
          message: `Step "${step.id}" does not accept input`,
          stepId: step.id,
          details: {
            input: pendingUserInput,
          },
        },
      };
    }

    switch (step.type) {
      case 'RunFlow': {
        currentStepId = step.next;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizePreviewResult(currentStepId, stepIndex, stepsById, previewState);
        }
        break;
      }

      case 'Prompt':
      case 'Choice':
      case 'DynamicChoice': {
        if (pendingUserInput === undefined) {
          const reader = readerFromStateRecord(previewState);
          try {
            return {
              cursor: { currentStepId: step.id, stepIndex },
              waitingFor: materializeWaitingFor(step, reader),
              status: 'waiting_input',
              stateAfter: previewState,
            };
          } catch (error) {
            if (error instanceof NoVisibleOptionsError) {
              return {
                cursor: { currentStepId: step.id, stepIndex },
                waitingFor: null,
                status: 'error',
                stateAfter: previewState,
                diagnostic: {
                  code: 'NO_VISIBLE_OPTIONS',
                  message: 'DynamicChoice has no visible options',
                  stepId: step.id,
                },
              };
            }
            throw error;
          }
        }

        if (step.stateKey) {
          try {
            previewSetState(previewState, step.stateKey, pendingUserInput);
          } catch (error) {
            return {
              cursor: { currentStepId: step.id, stepIndex },
              waitingFor: null,
              status: 'error',
              stateAfter: previewState,
              diagnostic: {
                code: inferStateErrorCode(error),
                message: (error as Error).message,
                stepId: step.id,
                details: {
                  input: pendingUserInput,
                  stateKey: step.stateKey,
                },
              },
            };
          }
        }

        pendingUserInput = undefined;
        currentStepId = step.next;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizePreviewResult(currentStepId, stepIndex, stepsById, previewState);
        }
        break;
      }

      case 'Branch': {
        const reader = readerFromStateRecord(previewState);
        let nextStepId = step.default;
        let setStatePayload: Record<string, any> | undefined = step.defaultSetState;
        try {
          for (const cond of step.conditions) {
            if (evalCondition(cond.when as ConditionSpec, reader, { mode: 'strict' })) {
              nextStepId = cond.next;
              setStatePayload = cond.setState;
              break;
            }
          }
        } catch (error) {
          return {
            cursor: { currentStepId: step.id, stepIndex },
            waitingFor: null,
            status: 'error',
            stateAfter: previewState,
            diagnostic: {
              code: 'CONDITION_EVAL_ERROR',
              message: (error as Error).message,
              stepId: step.id,
              details: {
                condition: step.conditions.map((cond) => cond.when),
              },
            },
          };
        }

        if (setStatePayload) {
          try {
            for (const [key, value] of Object.entries(setStatePayload)) {
              previewSetState(previewState, key, value);
            }
          } catch (error) {
            return {
              cursor: { currentStepId: step.id, stepIndex },
              waitingFor: null,
              status: 'error',
              stateAfter: previewState,
              diagnostic: {
                code: inferStateErrorCode(error),
                message: (error as Error).message,
                stepId: step.id,
                details: { setState: setStatePayload },
              },
            };
          }
        }

        currentStepId = nextStepId;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizePreviewResult(currentStepId, stepIndex, stepsById, previewState);
        }
        break;
      }

      case 'End': {
        return {
          cursor: { currentStepId: null, stepIndex: stepIndex + 1 },
          waitingFor: null,
          status: 'ended',
          stateAfter: previewState,
        };
      }
    }
  }

  return {
    cursor: { currentStepId: null, stepIndex },
    waitingFor: null,
    status: 'ended',
    stateAfter: previewState,
  };
}

export async function advanceSession(
  session: SessionDefinition,
  deps: SessionRunnerDeps,
  cursor: SessionCursor,
  options: AdvanceSessionOptions,
): Promise<SessionAdvanceResult> {
  const stepsById = createStepsById(session);

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

    if (pendingUserInput !== undefined && step.type !== 'Prompt' && step.type !== 'Choice' && step.type !== 'DynamicChoice') {
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
          return finalizeStepResult(currentStepId, stepIndex, events, stepsById, deps.getState());
        }
        break;
      }

      case 'Prompt':
      case 'Choice':
      case 'DynamicChoice': {
        if (pendingUserInput === undefined) {
          const reader = readerFromStateRecord(deps.getState());
          try {
            const waitingFor = materializeWaitingFor(step, reader);
            return {
              cursor: { currentStepId: step.id, stepIndex },
              events,
              waitingFor,
              status: 'waiting_input',
            };
          } catch (error) {
            if (error instanceof NoVisibleOptionsError) {
              return buildErrorResult({ currentStepId: step.id, stepIndex }, events, {
                code: 'NO_VISIBLE_OPTIONS',
                message: 'DynamicChoice has no visible options',
                stepId: step.id,
              });
            }
            throw error;
          }
        }

        const interactiveResult = await executeInteractiveStep(step, pendingUserInput, deps);
        pendingUserInput = undefined;
        if ('diagnostic' in interactiveResult) {
          return buildErrorResult({ currentStepId: step.id, stepIndex }, events, interactiveResult.diagnostic);
        }
        if (interactiveResult.event) {
          events.push(interactiveResult.event);
        }
        currentStepId = step.next;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizeStepResult(currentStepId, stepIndex, events, stepsById, deps.getState());
        }
        break;
      }

      case 'Branch': {
        const state = deps.getState();
        const reader = readerFromStateRecord(state);
        let nextStepId = step.default;
        let setStatePayload: Record<string, any> | undefined = step.defaultSetState;
        try {
          for (const cond of step.conditions) {
            if (evalCondition(cond.when as ConditionSpec, reader, { mode: 'strict' })) {
              nextStepId = cond.next;
              setStatePayload = cond.setState;
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
        // Apply setState side effects from the matched branch
        if (setStatePayload) {
          try {
            for (const [key, value] of Object.entries(setStatePayload)) {
              deps.setState(key, value);
            }
          } catch (error) {
            return buildErrorResult({ currentStepId: step.id, stepIndex }, events, {
              code: 'STATE_WRITE_FAILED',
              message: (error as Error).message,
              stepId: step.id,
              details: { setState: setStatePayload },
            });
          }
        }
        currentStepId = nextStepId;
        stepIndex += 1;
        if (options.mode === 'step') {
          return finalizeStepResult(currentStepId, stepIndex, events, stepsById, deps.getState());
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

function createStepsById(session: SessionDefinition): Map<string, SessionStep> {
  const stepsById = new Map<string, SessionStep>();
  for (const step of session.steps) {
    stepsById.set(step.id, step);
  }
  return stepsById;
}

function finalizeStepResult(
  currentStepId: string | null,
  stepIndex: number,
  events: SessionTraceEvent[],
  stepsById: Map<string, SessionStep>,
  state?: Record<string, StateValue>,
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

  if (nextStep.type === 'Prompt' || nextStep.type === 'Choice' || nextStep.type === 'DynamicChoice') {
    const reader = readerFromStateRecord(state ?? {});
    try {
      return {
        cursor: { currentStepId, stepIndex },
        events,
        waitingFor: materializeWaitingFor(nextStep, reader),
        status: 'waiting_input',
      };
    } catch (error) {
      if (error instanceof NoVisibleOptionsError) {
        return buildErrorResult({ currentStepId, stepIndex }, events, {
          code: 'NO_VISIBLE_OPTIONS',
          message: 'DynamicChoice has no visible options',
          stepId: currentStepId,
        });
      }
      throw error;
    }
  }

  return {
    cursor: { currentStepId, stepIndex },
    events,
    waitingFor: null,
    status: 'paused',
  };
}

function finalizePreviewResult(
  currentStepId: string | null,
  stepIndex: number,
  stepsById: Map<string, SessionStep>,
  stateAfter: Record<string, StateValue>,
): SessionPreviewResult {
  if (currentStepId === null) {
    return {
      cursor: { currentStepId: null, stepIndex },
      waitingFor: null,
      status: 'ended',
      stateAfter,
    };
  }

  const nextStep = stepsById.get(currentStepId);
  if (!nextStep) {
    return {
      cursor: { currentStepId, stepIndex },
      waitingFor: null,
      status: 'error',
      stateAfter,
      diagnostic: {
        code: 'SESSION_STEP_NOT_FOUND',
        message: `Step not found: ${currentStepId}`,
        stepId: currentStepId,
      },
    };
  }

  if (nextStep.type === 'Prompt' || nextStep.type === 'Choice' || nextStep.type === 'DynamicChoice') {
    const reader = readerFromStateRecord(stateAfter);
    try {
      return {
        cursor: { currentStepId, stepIndex },
        waitingFor: materializeWaitingFor(nextStep, reader),
        status: 'waiting_input',
        stateAfter,
      };
    } catch (error) {
      if (error instanceof NoVisibleOptionsError) {
        return {
          cursor: { currentStepId, stepIndex },
          waitingFor: null,
          status: 'error',
          stateAfter,
          diagnostic: {
            code: 'NO_VISIBLE_OPTIONS',
            message: 'DynamicChoice has no visible options',
            stepId: currentStepId,
          },
        };
      }
      throw error;
    }
  }

  return {
    cursor: { currentStepId, stepIndex },
    waitingFor: null,
    status: 'paused',
    stateAfter,
  };
}

async function executeInteractiveStep(
  step: PromptStep | ChoiceStep | DynamicChoiceStep,
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

function cloneStateRecord(state: Record<string, StateValue>): Record<string, StateValue> {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as Record<string, StateValue>;
}

function previewSetState(state: Record<string, StateValue>, key: string, value: any): void {
  const existing = state[key];
  if (!existing) {
    throw new Error(`State key not found: ${key}`);
  }
  state[key] = {
    ...existing,
    value,
  };
}
