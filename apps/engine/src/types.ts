import type {
  FlowDefinition,
  FlowExecutionResult,
  FlowMeta,
  InitialState,
  KalConfig,
  SessionAdvanceStatus,
  SessionCursor,
  SessionDefinition,
  StateValue,
} from '@kal-ai/core';
import type { DiagnosticPayload } from './debug/types';

export interface EngineProject {
  projectRoot: string;
  config: KalConfig;
  initialState: InitialState;
  flowsById: Record<string, FlowDefinition>;
  flowTextsById: Record<string, string>;
  flowFileMap: Record<string, string>;
  customNodeDir: string;
  session?: SessionDefinition;
}

export interface ProjectInfo {
  name: string;
  version: string;
  flows: string[];
  customNodes: string[];
  hasSession: boolean;
  state: {
    keys: string[];
  };
}

export interface FlowListItem {
  id: string;
  meta: FlowMeta;
}

export interface EngineResponse<T> {
  success: true;
  data: T;
}

export interface EngineErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface EngineErrorResponse {
  success: false;
  error: EngineErrorPayload;
}

export interface StartedEngineServer {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

export interface ExecuteFlowRequest {
  flowId: string;
  input?: Record<string, any>;
}

export interface ExecuteFlowResponse extends FlowExecutionResult {}

export interface EngineCliIO {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface RunWaitingFor {
  kind: 'prompt' | 'choice';
  step_id: string;
  prompt_text?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface RunOutputEvent {
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

export interface RunEndEvent {
  type: 'end';
  message?: string;
}

export type RunEvent = RunOutputEvent | RunEndEvent;

export interface RunStateSummary {
  total_keys: number;
  keys: string[];
  changed: string[];
  changed_values: Record<string, { old: any; new: any }>;
  preview: Record<string, any>;
}

export interface RunInputRecord {
  step_id: string;
  step_index: number;
  input: string;
  timestamp: number;
}

export interface RunSummary {
  run_id: string;
  status: SessionAdvanceStatus;
  waiting_for: RunWaitingFor | null;
  updated_at: number;
  created_at: number;
  active: boolean;
}

export interface RunView extends RunSummary {
  cursor: SessionCursor;
  state_summary: RunStateSummary;
  recent_events: RunEvent[];
  input_history: RunInputRecord[];
}

export interface RunStateView extends RunView {
  state: Record<string, StateValue>;
}

export interface CreateRunRequest {
  forceNew?: boolean;
  cleanup?: boolean;
  mode?: 'continue' | 'step';
  /** When provided, auto-advance the run using these inputs (smoke replay mode). */
  smokeInputs?: string[];
}

export interface AdvanceRunRequest {
  input?: string;
  cleanup?: boolean;
  mode?: 'continue' | 'step';
}

export type RunStreamEventName =
  | 'run.created'
  | 'run.updated'
  | 'run.ended'
  | 'run.cancelled'
  | 'run.invalidated';

export interface RunStreamEvent {
  type: RunStreamEventName;
  run: RunView;
}

export interface DiagnosticsPayload {
  project_root: string;
  diagnostics: DiagnosticPayload[];
  summary: {
    total_issues: number;
    errors: number;
    warnings: number;
  };
}

export type ExternalChangeEvent =
  | { kind: 'flow'; flowId: string }
  | { kind: 'config' }
  | { kind: 'initialState' }
  | { kind: 'session' }
  | { kind: 'customNode'; nodeType: string };

export type EngineEventName =
  | 'project.reloaded'
  | 'resource.changed'
  | 'diagnostics.updated'
  | 'run.created'
  | 'run.updated'
  | 'run.ended'
  | 'run.cancelled';

export interface EngineEvent {
  type: EngineEventName;
  timestamp: number;
  resourceId?: string;
  flowId?: string;
  sessionId?: string;
  runId?: string;
  message?: string;
  external?: boolean;
}
