import type {
  SessionTraceEvent,
  SessionWaitingFor,
  StateValue,
} from '@kal-ai/core';
import type { DebugRunSnapshot, DebugRunSummary } from './debug/types';
import type {
  RunEndEvent,
  RunEvent,
  RunInputRecord,
  RunOutputEvent,
  RunStateSummary,
  RunStateView,
  RunSummary,
  RunView,
  RunWaitingFor,
} from './types';

export function createRunnerDeps(runtime: {
  executeFlow(flowId: string, inputData?: Record<string, any>): Promise<any>;
  getState(): Record<string, StateValue>;
  setState(key: string, value: any): void;
}): {
  executeFlow(flowId: string, inputData?: Record<string, any>): Promise<any>;
  getState(): Record<string, StateValue>;
  setState(key: string, value: any): void;
} {
  return {
    executeFlow: (flowId: string, inputData?: Record<string, any>) =>
      runtime.executeFlow(flowId, inputData ?? {}),
    getState: () => runtime.getState(),
    setState: (key: string, value: any) => runtime.setState(key, value),
  };
}

export function toRunWaitingFor(waitingFor: SessionWaitingFor | null): RunWaitingFor | null {
  if (!waitingFor) {
    return null;
  }

  return {
    kind: waitingFor.kind,
    step_id: waitingFor.stepId,
    prompt_text: waitingFor.promptText,
    options: waitingFor.options,
  };
}

export function toRunEvent(event: SessionTraceEvent): RunEvent {
  if (event.type === 'end') {
    const output: RunEndEvent = {
      type: 'end',
      message: event.message,
    };
    return output;
  }

  const output: RunOutputEvent = {
    type: 'output',
    step_id: event.stepId,
    flow_id: event.flowId,
    raw: event.data,
    normalized: {
      narration: extractNarration(event.data),
      state_changes: diffStates(event.stateBefore, event.stateAfter),
      labels: Object.keys(event.data).sort(),
    },
  };
  return output;
}

export function buildRunStateSummary(
  afterState: Record<string, StateValue>,
  beforeState: Record<string, StateValue> = afterState,
): RunStateSummary {
  const changedValues = diffStates(beforeState, afterState);
  return {
    total_keys: Object.keys(afterState).length,
    keys: Object.keys(afterState).sort(),
    changed: Object.keys(changedValues).sort(),
    changed_values: changedValues,
    preview: buildStatePreview(afterState),
  };
}

export function buildRunSummary(summary: DebugRunSummary): RunSummary {
  return {
    run_id: summary.runId,
    status: summary.status,
    waiting_for: toRunWaitingFor(summary.waitingFor),
    updated_at: summary.updatedAt,
    created_at: summary.createdAt,
    active: summary.active,
  };
}

export function buildRunView(
  snapshot: DebugRunSnapshot,
  options?: {
    active?: boolean;
    beforeState?: Record<string, StateValue>;
  },
): RunView {
  return {
    run_id: snapshot.runId,
    status: snapshot.status,
    waiting_for: toRunWaitingFor(snapshot.waitingFor),
    updated_at: snapshot.updatedAt,
    created_at: snapshot.createdAt,
    active: options?.active ?? false,
    cursor: snapshot.cursor,
    state_summary: buildRunStateSummary(snapshot.stateSnapshot, options?.beforeState ?? snapshot.stateSnapshot),
    recent_events: snapshot.recentEvents.map(toRunEvent),
    input_history: snapshot.inputHistory.map<RunInputRecord>((record) => ({
      step_id: record.stepId,
      step_index: record.stepIndex,
      input: record.input,
      timestamp: record.timestamp,
    })),
    diagnostic: snapshot.diagnostic,
  };
}

export function buildRunStateView(
  snapshot: DebugRunSnapshot,
  options?: {
    active?: boolean;
    beforeState?: Record<string, StateValue>;
  },
): RunStateView {
  return {
    ...buildRunView(snapshot, options),
    state: snapshot.stateSnapshot,
  };
}

export function diffStates(
  beforeState: Record<string, StateValue>,
  afterState: Record<string, StateValue>,
): Record<string, { old: any; new: any }> {
  const changed: Record<string, { old: any; new: any }> = {};
  const keys = new Set([...Object.keys(beforeState), ...Object.keys(afterState)]);

  for (const key of [...keys].sort()) {
    const beforeValue = beforeState[key];
    const afterValue = afterState[key];
    const beforeJson = beforeValue ? JSON.stringify(beforeValue) : '';
    const afterJson = afterValue ? JSON.stringify(afterValue) : '';
    if (beforeJson === afterJson) {
      continue;
    }
    changed[key] = {
      old: beforeValue?.value ?? null,
      new: afterValue?.value ?? null,
    };
  }

  return changed;
}

function buildStatePreview(state: Record<string, StateValue>): Record<string, any> {
  const preview: Record<string, any> = {};

  for (const key of Object.keys(state).sort()) {
    if (Object.keys(preview).length >= 6) {
      break;
    }
    preview[key] = toPreviewValue(state[key]?.value ?? null);
  }

  return preview;
}

function toPreviewValue(value: any): any {
  if (typeof value === 'string') {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length > 4
      ? [...value.slice(0, 4), `...(${value.length - 4} more)`]
      : value.map((item) => toPreviewValue(item));
  }
  if (typeof value === 'object') {
    const preview: Record<string, any> = {};
    const entries = Object.entries(value);
    for (const [key, entryValue] of entries.slice(0, 4)) {
      preview[key] = toPreviewValue(entryValue);
    }
    if (entries.length > 4) {
      preview.__truncated__ = `${entries.length - 4} more keys`;
    }
    return preview;
  }
  return String(value);
}

function extractNarration(data: Record<string, any>): string | undefined {
  const unwrapped = unwrapSingleEntryObject(data);
  const preferredKeys = ['narration', 'text', 'message', 'reply'];
  for (const key of preferredKeys) {
    if (typeof unwrapped[key] === 'string' && unwrapped[key].trim().length > 0) {
      return unwrapped[key];
    }
  }

  for (const value of Object.values(unwrapped)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function unwrapSingleEntryObject(data: Record<string, any>): Record<string, any> {
  const entries = Object.entries(data);
  if (entries.length !== 1) {
    return data;
  }

  const onlyValue = entries[0]?.[1];
  return onlyValue && typeof onlyValue === 'object' && !Array.isArray(onlyValue)
    ? onlyValue as Record<string, any>
    : data;
}
