import type {
  SessionAdvanceError,
  SessionAdvanceStatus,
  SessionCursor,
  SessionTraceEvent,
  SessionWaitingFor,
  StateValue,
} from '@kal-ai/core';

export interface DebugInputRecord {
  stepId: string;
  stepIndex: number;
  input: string;
  timestamp: number;
}

export interface StateChangeLogEntry {
  stepId: string;
  stepIndex: number;
  key: string;
  before: any;
  after: any;
  timestamp: number;
}

export interface DebugRunSnapshot {
  runId: string;
  projectRoot: string;
  sessionHash: string;
  cursor: SessionCursor;
  waitingFor: SessionWaitingFor | null;
  status: SessionAdvanceStatus;
  diagnostic?: SessionAdvanceError;
  stateSnapshot: Record<string, StateValue>;
  recentEvents: SessionTraceEvent[];
  inputHistory: DebugInputRecord[];
  stateChangeLog: StateChangeLogEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface DebugRunSummary {
  runId: string;
  projectRoot: string;
  status: SessionAdvanceStatus;
  waitingFor: SessionWaitingFor | null;
  updatedAt: number;
  createdAt: number;
  active: boolean;
}

export interface DiagnosticPayload {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  phase: 'project_load' | 'session' | 'flow' | 'node' | 'cli';
  stepId?: string;
  flowId?: string;
  nodeId?: string;
  nodeType?: string;
  errorType?: string;
  file?: string;
  jsonPath?: string;
  suggestions: string[];
  details?: unknown;
  context?: {
    input?: string;
    flowInputs?: Record<string, any>;
    nodeInputs?: Record<string, any>;
    stateSnapshot?: Record<string, StateValue>;
    llmRequest?: string;
    llmResponse?: string;
  };
  location?: DebugLocation;
  root_cause: DebugRootCause;
  remediation: {
    suggestions: string[];
  };
  evidence?: DebugEvidence;
}

export interface DebugOutputEvent {
  type: 'output';
  step_id: string;
  flow_id?: string;
  raw: Record<string, any>;
  normalized: {
    narration?: string;
    state_changes: Record<string, { old: any; new: any }>;
    labels: string[];
  };
}

export interface DebugEndEvent {
  type: 'end';
  message?: string;
}

export type DebugEvent = DebugOutputEvent | DebugEndEvent;

export interface DebugWaitingForPayload {
  kind: 'prompt' | 'choice';
  step_id: string;
  prompt_text?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface DebugLocation {
  phase: DiagnosticPayload['phase'];
  step_id?: string;
  flow_id?: string;
  node_id?: string;
  node_type?: string;
  file?: string;
  json_path?: string;
}

export interface DebugRootCause {
  code: string;
  message: string;
  error_type?: string;
}

export interface DebugEvidence {
  input?: string;
  flow_inputs?: Record<string, any>;
  node_inputs?: Record<string, any>;
  state_snapshot?: Record<string, StateValue>;
  llm_request?: string;
  llm_response?: string;
}

export interface DebugActionDescriptor {
  kind:
    | 'provide_input'
    | 'step'
    | 'continue'
    | 'inspect_state'
    | 'start_new_run'
    | 'delete_run'
    | 'list_runs'
    | 'fix_files'
    | 'retry';
  command: string | null;
  description: string;
  input_required: boolean;
}

export interface DebugStateSummary {
  total_keys: number;
  keys: string[];
  changed: string[];
  changed_values: Record<string, { old: any; new: any }>;
  preview: Record<string, any>;
}

export interface DebugObservation {
  summary: string;
  blocking_reason:
    | 'awaiting_input'
    | 'paused_after_step'
    | 'session_ended'
    | 'runtime_error'
    | 'invalid_request'
    | 'snapshot_invalid'
    | 'missing_run'
    | 'conflicting_run';
  current_step: {
    step_id: string | null;
    step_index: number | null;
  };
  waiting_for: DebugWaitingForPayload | null;
  location?: DebugLocation;
  root_cause?: DebugRootCause;
  state_delta: {
    changed_keys: string[];
    changed_values: Record<string, { old: any; new: any }>;
    preview: Record<string, any>;
  };
  allowed_next_actions: DebugActionDescriptor[];
  suggested_next_action: DebugActionDescriptor | null;
}

export interface DebugAdvancePayload {
  run_id: string | null;
  status: SessionAdvanceStatus;
  waiting_for: DebugWaitingForPayload | null;
  events: DebugEvent[];
  state_summary: DebugStateSummary;
  diagnostics: DiagnosticPayload[];
  next_action: string | null;
  observation: DebugObservation;
  llm_traces?: Array<{
    nodeId: string;
    model: string;
    request: string;
    response: string;
    latencyMs?: number;
    cached?: boolean;
  }>;
}

export interface DebugStatePayload {
  run_id: string;
  status: SessionAdvanceStatus;
  waiting_for: DebugWaitingForPayload | null;
  state: Record<string, StateValue>;
  state_summary: DebugStateSummary;
  cursor: SessionCursor;
  observation: DebugObservation;
  input_history?: DebugInputRecord[];
  stateChangeLog?: StateChangeLogEntry[];
  updated_at: number;
}

export interface DebugListPayload {
  project_root: string;
  runs: Array<{
    run_id: string;
    status: SessionAdvanceStatus;
    waiting_for: DebugWaitingForPayload | null;
    updated_at: number;
    created_at: number;
    active: boolean;
  }>;
}

export interface DebugDeletePayload {
  deleted: true;
  run_id: string;
}
