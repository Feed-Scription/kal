export type FlowDefinition = {
  schemaVersion: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
};

export type NodeDefinition = {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  config?: Record<string, any>;
};

export type HandleDefinition = {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: any;
};

export type EdgeDefinition = {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};

export type StateValue = {
  type: string;
  value: any;
};

export type ProjectState = Record<string, StateValue>;

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

export type ProjectData = {
  path: string;
  config: KalConfig;
  flows: Record<string, FlowDefinition>;
  state: ProjectState;
};
