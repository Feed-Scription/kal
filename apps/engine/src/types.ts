import type {
  FlowDefinition,
  FlowExecutionResult,
  FlowMeta,
  InitialState,
  KalConfig,
  SessionDefinition,
} from '@kal-ai/core';

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
