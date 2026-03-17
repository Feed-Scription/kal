/**
 * Kernel Service Interfaces
 *
 * 扩展和组件消费 Kernel 能力的唯一 typed contract。
 * 每个接口与 hooks.ts 中对应的 hook 返回值 1:1 对齐。
 */

import type {
  CheckpointRecord,
  CommentThreadRecord,
  DiagnosticsPayload,
  FlowDefinition,
  GitLogResult,
  GitStatusResult,
  InstalledPackageRecord,
  KalConfig,
  NodeManifest,
  ProjectData,
  ProjectState,
  PromptPreviewEntry,
  ReferenceEntry,
  ResourceVersionState,
  ReviewProposalRecord,
  RunBreakpointRecord,
  RunStateView,
  RunStreamEvent,
  RunSummary,
  RunTraceRecord,
  RunView,
  SearchResult,
  SessionDefinition,
  StateDiffEntry,
  TraceTimelineEntry,
  TransactionRecord,
} from '@/types/project';
import type { RunAdvanceMode } from '@/api/engine-client';
import type {
  ResolvedStudioCapabilityRequest,
  StudioCapabilityId,
  StudioExtensionId,
  StudioExtensionRuntimeRecord,
  StudioJobRecord,
  StudioKernelEventName,
  StudioKernelEventRecord,
  StudioRegisteredExtensionDescriptor,
  StudioViewDescriptor,
  StudioViewId,
  StudioWorkspacePreset,
  StudioContextValue,
  StudioPanelDescriptor,
  StudioInspectorDescriptor,
  StudioDebugViewDescriptor,
  PresenceUser,
  PresenceActivity,
} from '@/kernel/types';

// ── Resource Service ──

export interface ResourceServiceState {
  project: ProjectData | null;
  config: KalConfig | null;
  state: ProjectState;
  session: SessionDefinition | null;
  nodeManifests: NodeManifest[];
}

export interface FlowResourceState {
  flowId: string | null;
  flow: FlowDefinition | null;
  flowNames: string[];
}

export interface PromptPreviewState {
  entries: PromptPreviewEntry[];
  total: number;
}

// ── Workbench Service ──

export interface WorkbenchServiceState {
  activeViewId: StudioViewId;
  openViewIds: StudioViewId[];
  openViews: StudioViewDescriptor[];
  activeFlowId: string | null;
  activePreset: StudioWorkspacePreset;
  commandPaletteOpen: boolean;
  activeView: StudioViewDescriptor;
  activeExtension: StudioRegisteredExtensionDescriptor | null;
  activeExtensionRuntime: StudioExtensionRuntimeRecord | null;
  views: StudioViewDescriptor[];
  extensions: StudioRegisteredExtensionDescriptor[];
  coreExtensions: StudioRegisteredExtensionDescriptor[];
  workflowExtensions: StudioRegisteredExtensionDescriptor[];
}

// ── Connection Service ──

export interface ConnectionServiceState {
  engineConnected: boolean;
  connecting: boolean;
  connectionError: string | null;
}

// ── Save Service ──

export interface SaveServiceState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  resource?: string;
  message?: string;
  updatedAt?: number;
}

// ── Version Control Service ──

export interface VersionControlServiceState {
  resourceVersions: Record<string, ResourceVersionState>;
  transactions: TransactionRecord[];
  checkpoints: CheckpointRecord[];
  diagnostics: DiagnosticsPayload | null;
  diagnosticsUpdatedAt?: number;
  undoStack: Array<{ id: string; label: string; timestamp: number }>;
  redoStack: Array<{ id: string; label: string; timestamp: number }>;
}

// ── Run Debug Service ──

export interface RunDebugServiceState {
  selectedRunId: string | null;
  selectedRecord: RunTraceRecord | null;
  selectedRun: RunView | null;
  selectedRunState: RunStateView | null;
  selectedInputHistory: RunView['input_history'];
  selectedTimeline: TraceTimelineEntry[];
  selectedStateDiff: StateDiffEntry[];
  selectedStepId: string | null;
  selectedWaitingStepId: string | null;
  breakpoints: RunBreakpointRecord[];
  hasBreakpointAtStep: (stepId?: string | null) => boolean;
  runs: RunTraceRecord[];
  records: Record<string, RunTraceRecord>;
}

// ── Review Service ──

export interface ReviewServiceState {
  activeProposalId: string | null;
  activeProposal: ReviewProposalRecord | null;
  proposals: ReviewProposalRecord[];
}

// ── Comments Service ──

export interface CommentsServiceState {
  activeThreadId: string | null;
  activeThread: CommentThreadRecord | null;
  threads: CommentThreadRecord[];
}

// ── Git Service ──

export interface GitServiceState {
  status: GitStatusResult | null;
  log: GitLogResult | null;
  updatedAt?: number;
}

// ── Packages Service ──

export interface PackagesServiceState {
  installed: InstalledPackageRecord[];
  loading: boolean;
  updatedAt?: number;
}

// ── Presence Service ──

export interface PresenceServiceState {
  users: PresenceUser[];
  activities: PresenceActivity[];
  selfId: string | null;
}

// ── Kernel Event Service ──

export interface KernelEventServiceState {
  events: StudioKernelEventRecord[];
  jobs: StudioJobRecord[];
}

// ── Capability Service ──

export interface CapabilityGateResult {
  grants: Record<StudioCapabilityId, boolean>;
  resolved: Array<ResolvedStudioCapabilityRequest & { granted: boolean }>;
  trusted: boolean;
  blocked: Array<ResolvedStudioCapabilityRequest & { granted: boolean }>;
  degraded: Array<ResolvedStudioCapabilityRequest & { granted: boolean }>;
}

// ── Diagnostics Service ──

export interface DiagnosticsServiceState {
  diagnostics: DiagnosticsPayload | null;
  updatedAt?: number;
}

// ── Reference Graph Service ──

export interface ReferenceGraphServiceState {
  entries: ReferenceEntry[];
  searchResults: SearchResult | null;
  searchQuery: string;
  loading: boolean;
  updatedAt?: number;
}

// ── Workbench Context ──

export interface WorkbenchContextState {
  values: Record<string, StudioContextValue>;
}

// ── Contribution Resolution ──

export interface ResolvedContribution<T> {
  contribution: T;
  runtime: StudioExtensionRuntimeRecord | null;
}

export type ResolvedPanelContribution = ResolvedContribution<StudioPanelDescriptor>;
export type ResolvedInspectorContribution = ResolvedContribution<StudioInspectorDescriptor>;
export type ResolvedDebugViewContribution = ResolvedContribution<StudioDebugViewDescriptor>;

// ── Command Service ──

export interface StudioCommandService {
  connect: () => Promise<void>;
  disconnect: () => void;
  setActiveView: (viewId: StudioViewId) => void;
  closeView: (viewId: StudioViewId) => void;
  setActivePreset: (preset: StudioWorkspacePreset) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  openFlow: (flowName: string) => void;
  saveFlow: (flowName: string, flow: FlowDefinition) => Promise<void>;
  createFlow: (flowName: string) => Promise<void>;
  executeFlow: (flowId: string, input?: Record<string, unknown>) => Promise<unknown>;
  reloadProject: () => Promise<void>;
  saveSession: (session: SessionDefinition) => Promise<void>;
  deleteSession: () => Promise<void>;
  updateConfig: (patch: Partial<KalConfig>) => Promise<void>;
  createRun: (forceNew?: boolean, mode?: RunAdvanceMode) => Promise<RunView>;
  createSmokeRun: (inputs?: string[]) => Promise<RunView>;
  listRuns: () => Promise<RunSummary[]>;
  refreshRuns: () => Promise<RunSummary[]>;
  getRun: (runId: string) => Promise<RunView>;
  getRunState: (runId: string) => Promise<RunStateView>;
  selectRun: (runId: string | null) => Promise<void>;
  advanceRun: (runId: string, input?: string, mode?: RunAdvanceMode) => Promise<RunView>;
  stepRun: (runId: string, input?: string) => Promise<RunView>;
  replayRun: (runId: string) => Promise<RunView>;
  toggleBreakpoint: (stepId: string) => void;
  clearBreakpoint: (stepId: string) => void;
  cancelRun: (runId: string) => Promise<void>;
  createCheckpoint: (label?: string, description?: string) => CheckpointRecord | null;
  restoreCheckpoint: (checkpointId: string) => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  createReviewProposal: (input?: { title?: string; intent?: string; baseCheckpointId?: string | null }) => string | null;
  setActiveProposal: (proposalId: string | null) => void;
  validateProposal: (proposalId: string) => Promise<void>;
  acceptProposal: (proposalId: string) => Promise<void>;
  rollbackProposal: (proposalId: string) => Promise<void>;
  createCommentThread: (input: {
    title: string;
    anchor: CommentThreadRecord['anchor'];
    body: string;
    author?: string;
  }) => string | null;
  addComment: (threadId: string, body: string, author?: string) => void;
  resolveCommentThread: (threadId: string, resolved: boolean) => void;
  setActiveCommentThread: (threadId: string | null) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setCapabilityGrant: (capability: StudioCapabilityId, granted: boolean) => void;
  resetCapabilityGrants: () => void;
  setExtensionEnabled: (extensionId: StudioExtensionId, enabled: boolean) => void;
  activateExtension: (extensionId: StudioExtensionId, reason: string) => void;
  clearExtensionError: (extensionId: StudioExtensionId) => void;
  markExtensionError: (extensionId: StudioExtensionId, message: string) => void;
  recordKernelEvent: (event: {
    type: StudioKernelEventName;
    message: string;
    resourceId?: string;
    extensionId?: StudioExtensionId;
    runId?: string;
    jobId?: string;
    data?: Record<string, unknown>;
  }) => void;
  refreshGitStatus: () => Promise<void>;
  loadPackages: () => Promise<void>;
  refreshReferences: (resourceId?: string) => Promise<void>;
  searchProject: (query: string) => Promise<void>;
  applyTemplate: (templateId: string, packageId: string) => Promise<void>;
}

// ── Run Service (non-React) ──

export interface RunService {
  subscribe(runId: string, onEvent: (event: RunStreamEvent) => void): () => void;
}
