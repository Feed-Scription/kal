// ── Handle ──

export type HandleDefinition = {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: any;
};

// ── Node ──

export type NodeDefinition = {
  id: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  config?: Record<string, any>;
  ref?: string;
};

// ── Edge ──

export type EdgeDefinition = {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};

// ── Flow (aligned with Core: { meta, data }) ──

export type FlowMeta = {
  schemaVersion: string;
  name?: string;
  description?: string;
  inputs?: HandleDefinition[];
  outputs?: HandleDefinition[];
};

export type FlowData = {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
};

export type FlowDefinition = {
  meta: FlowMeta;
  data: FlowData;
};

// ── State ──

export type StateValue = {
  type: string;
  value: any;
};

export type ProjectState = Record<string, StateValue>;

// ── Config ──

export type KalConfig = {
  name: string;
  version: string;
  engine: {
    logLevel: string;
    maxConcurrentFlows: number;
    timeout: number;
  };
  llm: {
    provider: string;
    apiKey?: string;
    baseUrl?: string;
    defaultModel: string;
    retry: {
      maxRetries: number;
      initialDelayMs: number;
      maxDelayMs: number;
      backoffMultiplier: number;
      jitter: boolean;
    };
    cache: {
      enabled: boolean;
    };
  };
};

// ── Session ──

export type RunFlowStep = {
  id: string;
  type: 'RunFlow';
  flowRef: string;
  next: string;
};

export type PromptStep = {
  id: string;
  type: 'Prompt';
  flowRef?: string;
  inputChannel?: string;
  stateKey?: string;
  promptText?: string;
  next: string;
};

export type BranchStep = {
  id: string;
  type: 'Branch';
  conditions: { when: string; next: string }[];
  default: string;
};

export type EndStep = {
  id: string;
  type: 'End';
  message?: string;
};

export type ChoiceStep = {
  id: string;
  type: 'Choice';
  promptText: string;
  options: { label: string; value: string }[];
  flowRef?: string;
  inputChannel?: string;
  stateKey?: string;
  next: string;
};

export type SessionStep = RunFlowStep | PromptStep | BranchStep | EndStep | ChoiceStep;

export type SessionDefinition = {
  schemaVersion: string;
  name?: string;
  description?: string;
  entryStep?: string;
  steps: SessionStep[];
};

// ── Project ──

export type ProjectData = {
  name: string;
  config: KalConfig;
  flows: Record<string, FlowDefinition>;
  state: ProjectState;
  session: SessionDefinition | null;
  nodeManifests: NodeManifest[];
};

// ── Engine API types ──

export type FlowListItem = {
  id: string;
  meta: FlowMeta;
};

export type ProjectInfo = {
  name: string;
  version: string;
  flows: string[];
  customNodes: string[];
  hasSession: boolean;
  state: {
    keys: string[];
  };
};

export type ExecutionResult = {
  outputs: Record<string, any>;
  duration?: number;
  error?: string;
};

export type NodeManifest = {
  type: string;
  label?: string;
  category?: string;
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  configSchema?: Record<string, any>;
  defaultConfig?: Record<string, any>;
};
