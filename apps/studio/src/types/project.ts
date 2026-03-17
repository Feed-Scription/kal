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

export type ConditionSpec = string | Record<string, unknown>;

export type BranchCondition = {
  when: ConditionSpec;
  next: string;
  setState?: Record<string, unknown>;
};

export type BranchStep = {
  id: string;
  type: 'Branch';
  conditions: BranchCondition[];
  default: string;
  defaultSetState?: Record<string, unknown>;
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

export type OptionsFromState = {
  stateKey: string;
  labelField?: string;
  valueField?: string;
  whenField?: string;
};

export type DynamicChoiceOption = {
  label: string;
  value: string;
  when?: ConditionSpec;
};

export type DynamicChoiceStep = {
  id: string;
  type: 'DynamicChoice';
  promptText: string;
  options: DynamicChoiceOption[];
  optionsFromState?: OptionsFromState;
  flowRef?: string;
  inputChannel?: string;
  stateKey?: string;
  next: string;
};

export type SessionStep = RunFlowStep | PromptStep | BranchStep | EndStep | ChoiceStep | DynamicChoiceStep;

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

export type ResourceId =
  | 'project://current'
  | 'config://project'
  | 'state://project'
  | 'session://default'
  | `flow://${string}`
  | `template://${string}`;

export type ResourceVersionState = {
  resourceId: ResourceId;
  version: number;
  updatedAt: number;
  lastTransactionId?: string;
};

export type TransactionOrigin = {
  kind: 'user' | 'system' | 'agent';
  id: string;
  label: string;
};

export type TransactionOperation = {
  type:
    | 'project.reload'
    | 'flow.save'
    | 'flow.create'
    | 'flow.delete'
    | 'session.save'
    | 'session.delete'
    | 'config.save'
    | 'diagnostics.refresh'
    | 'checkpoint.restore'
    | 'transaction.undo'
    | 'transaction.redo';
  resourceId: ResourceId;
  summary: string;
};

export type TransactionRecord = {
  id: string;
  resourceId: ResourceId;
  baseVersion: number;
  nextVersion: number;
  timestamp: number;
  origin: TransactionOrigin;
  operations: TransactionOperation[];
};

export type RestorableSnapshot = {
  flows: Record<string, FlowDefinition>;
  session: SessionDefinition | null;
  config?: KalConfig;
  state?: ProjectState;
};

export type CheckpointRecord = {
  id: string;
  label: string;
  description?: string;
  createdAt: number;
  resourceIds: ResourceId[];
  snapshot: RestorableSnapshot;
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

export type RunWaitingFor = {
  kind: 'prompt' | 'choice';
  step_id: string;
  prompt_text?: string;
  options?: Array<{ label: string; value: string }>;
};

export type RunOutputEvent = {
  type: 'output';
  step_id: string;
  flow_id?: string;
  raw: Record<string, any>;
  normalized: {
    narration?: string;
    state_changes: Record<string, { old: any; new: any }>;
    labels: string[];
  };
};

export type RunEndEvent = {
  type: 'end';
  message?: string;
};

export type RunEvent = RunOutputEvent | RunEndEvent;

export type RunStateSummary = {
  total_keys: number;
  keys: string[];
  changed: string[];
  changed_values: Record<string, { old: any; new: any }>;
  preview: Record<string, any>;
};

export type RunInputRecord = {
  step_id: string;
  step_index: number;
  input: string;
  timestamp: number;
};

export type RunBreakpointRecord = {
  step_id: string;
  created_at: number;
  hit_count: number;
  last_hit_at?: number;
};

export type RunSummary = {
  run_id: string;
  status: 'paused' | 'waiting_input' | 'ended' | 'error';
  waiting_for: RunWaitingFor | null;
  updated_at: number;
  created_at: number;
  active: boolean;
};

export type RunView = RunSummary & {
  cursor: {
    currentStepId: string | null;
    stepIndex: number;
  };
  state_summary: RunStateSummary;
  recent_events: RunEvent[];
  input_history: RunInputRecord[];
};

export type RunStateView = RunView & {
  state: Record<string, StateValue>;
};

export type RunStreamEventName =
  | 'run.created'
  | 'run.updated'
  | 'run.ended'
  | 'run.cancelled'
  | 'run.invalidated';

export type RunStreamEvent = {
  type: RunStreamEventName;
  run: RunView;
};

export type TraceTimelineEntry = {
  id: string;
  run_id: string;
  timestamp: number;
  source: 'snapshot' | 'stream' | 'annotation';
  eventType: RunStreamEventName | RunEvent['type'] | 'run.state' | 'run.input' | 'run.breakpoint';
  title: string;
  detail?: string;
  status: RunView['status'];
  cursorStepId?: string | null;
  waitingFor?: string | null;
  changedKeys: string[];
};

export type StateDiffEntry = {
  key: string;
  before: any;
  after: any;
};

export type RunTraceRecord = {
  runId: string;
  run: RunView;
  state?: RunStateView;
  timeline: TraceTimelineEntry[];
  annotations: TraceTimelineEntry[];
  stateDiff: StateDiffEntry[];
  updatedAt: number;
  subscribed: boolean;
  resourceVersion?: number;
};

export type SmokeStepResult = {
  step: number;
  stepId: string | null;
  status: string;
  waitingFor?: { kind: string; promptText?: string; options?: Array<{ label: string; value: string }> };
  inputProvided?: string;
  stateChanges?: Record<string, { before: any; after: any }>;
  error?: { code: string; message: string };
};

export type SmokeResult = {
  project: string;
  totalSteps: number;
  completedSteps: number;
  finalStatus: string;
  dryRun: boolean;
  steps: SmokeStepResult[];
  finalState?: Record<string, any>;
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

export type DiagnosticPayload = {
  code: string;
  message: string;
  severity?: 'error' | 'warning' | 'info';
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
};

export type DiagnosticsPayload = {
  project_root: string;
  diagnostics: DiagnosticPayload[];
  summary: {
    total_issues: number;
    errors: number;
    warnings: number;
  };
};

export type PromptPreviewBinding = {
  key: string;
  value: string;
};

export type PromptPreviewEntry = {
  id: string;
  source: 'session-step' | 'flow-node';
  resourceId: ResourceId;
  title: string;
  subtitle: string;
  promptText: string;
  bindings: PromptPreviewBinding[];
};

export type ReviewValidationRecord = {
  lintStatus: 'idle' | 'running' | 'completed' | 'failed';
  smokeStatus: 'idle' | 'running' | 'completed' | 'failed';
  diagnostics?: DiagnosticsPayload | null;
  smoke?: SmokeResult | null;
  lastValidatedAt?: number;
  error?: string;
};

export type ReviewProposalStatus = 'draft' | 'ready' | 'accepted' | 'rolled-back';

export type ReviewProposalRecord = {
  id: string;
  title: string;
  intent: string;
  status: ReviewProposalStatus;
  createdAt: number;
  origin: TransactionOrigin;
  baseCheckpointId?: string;
  baseResourceVersion?: number;
  touchedResources: ResourceId[];
  semanticSummary: {
    addedFlows: string[];
    removedFlows: string[];
    changedFlows: Array<{
      flowName: string;
      beforeNodes: number;
      afterNodes: number;
      beforeEdges: number;
      afterEdges: number;
      addedNodes?: string[];
      removedNodes?: string[];
      changedNodes?: Array<{ nodeId: string; changes: string[] }>;
      addedEdges?: number;
      removedEdges?: number;
    }>;
    sessionChanged: boolean;
    beforeSessionSteps: number;
    afterSessionSteps: number;
    sessionDiff?: {
      addedSteps: string[];
      removedSteps: string[];
      changedSteps: Array<{ stepId: string; changes: string[] }>;
    };
    configChanged?: boolean;
    stateChanged?: boolean;
  };
  expectedDiagnostics: {
    totalIssues: number;
    errors: number;
    warnings: number;
  };
  recommendedValidations: string[];
  riskNotes: string[];
  relatedRunId?: string;
  relatedStateKeys: string[];
  validation: ReviewValidationRecord;
};

export type CommentAnchor =
  | { kind: 'proposal'; proposalId: string }
  | { kind: 'resource'; resourceId: string }
  | { kind: 'run'; runId: string };

export type CommentRecord = {
  id: string;
  author: string;
  body: string;
  createdAt: number;
};

export type CommentThreadStatus = 'open' | 'resolved';

export type CommentThreadRecord = {
  id: string;
  title: string;
  anchor: CommentAnchor;
  status: CommentThreadStatus;
  createdAt: number;
  updatedAt: number;
  comments: CommentRecord[];
};

// ── Reference Graph + Search ──

export type ReferenceKind =
  | 'session-step->flow'
  | 'session-step->state-key'
  | 'flow-node->node-type'
  | 'flow-edge->node'
  | 'session-step->step';

export type ReferenceEntry = {
  kind: ReferenceKind;
  sourceResource: string;
  sourceId: string;
  targetResource: string;
  targetId: string;
  location?: string;
};

export type SearchEntry = {
  resourceId: string;
  resourceType: string;
  id: string;
  field: string;
  text: string;
};

export type SearchResult = {
  query: string;
  matches: Array<SearchEntry & { score: number }>;
};

// ── Engine Event Stream ──

export type EngineEventName =
  | 'project.reloaded'
  | 'resource.changed'
  | 'diagnostics.updated'
  | 'run.created'
  | 'run.updated'
  | 'run.ended'
  | 'run.cancelled';

export type EngineEvent = {
  type: EngineEventName;
  timestamp: number;
  resourceId?: string;
  flowId?: string;
  sessionId?: string;
  runId?: string;
  message?: string;
};

// ── Git ──

export type GitStatusResult = {
  available: boolean;
  branch: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
};

export type GitCommitEntry = {
  hash: string;
  message: string;
  author: string;
  date: string;
};

export type GitLogResult = {
  available: boolean;
  commits: GitCommitEntry[];
};

// ── Package Manifest ──

export type PackageKind =
  | 'node-pack'
  | 'studio-extension'
  | 'template-pack'
  | 'starter-pack'
  | 'theme-pack';

export type PackageTrustLevel = 'official' | 'team' | 'third-party' | 'unverified';

export type PackageContributions = {
  nodes?: NodeManifest[];
  views?: Array<{ id: string; title: string; icon?: string }>;
  panels?: Array<{ id: string; title: string; slot?: string }>;
  commands?: Array<{ id: string; title: string }>;
  templates?: TemplateEntry[];
  themes?: Array<{ id: string; name: string }>;
};

export type TemplateEntry = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  flows?: string[];
  sessionRef?: string;
  stateKeys?: string[];
  previewImage?: string;
};

export type PackageManifest = {
  id: string;
  kind: PackageKind;
  version: string;
  name: string;
  description?: string;
  author?: string;
  license?: string;
  repository?: string;
  capabilities?: string[];
  host?: 'browser' | 'workspace' | 'service';
  activationEvents?: string[];
  contributes?: PackageContributions;
  dependencies?: Record<string, string>;
  main?: string;
  runtime?: string;
  studio?: string;
};

export type InstalledPackageRecord = {
  manifest: PackageManifest;
  installPath: string;
  installedAt: number;
  trustLevel: PackageTrustLevel;
  enabled: boolean;
  signature?: string;
  provenance?: string;
};
