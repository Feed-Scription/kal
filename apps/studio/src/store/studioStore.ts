/**
 * Studio Store — Kernel 私有实现
 *
 * @internal 此模块为 Kernel 内部实现，禁止在 `kernel/` 之外直接引用。
 * 扩展和组件应通过 `@/kernel` 导出的 hooks 和 service 接口消费 Kernel 能力。
 *
 * @see {@link ../kernel/index.ts} for Kernel Public API
 */

import { create } from 'zustand';
import i18n from '@/i18n';
import { formatTimeShort } from '@/i18n/format';
import { engineApi } from '@/api/engine-client';
import { setCapabilityProvider } from '@/api/engine-client';
import { setConnectionLostHandler } from '@/api/engine-client';
import type { RunAdvanceMode } from '@/api/engine-client';
import {
  DEFAULT_STUDIO_VIEW_ID,
  OFFICIAL_STUDIO_EXTENSIONS,
  getAllViews,
  getStudioExtensionForView,
} from '@/kernel/registry';
import { compareSnapshot } from '@/kernel/semantic-diff';
import type {
  ResolvedStudioCapabilityRequest,
  StudioCapabilityId,
  StudioJobRecord,
  StudioKernelEventName,
  StudioKernelEventRecord,
  StudioExtensionId,
  StudioExtensionRuntimeRecord,
  StudioViewId,
  StudioWorkspacePreset,
  PresenceUser,
  PresenceActivity,
} from '@/kernel/types';
import type {
  CheckpointRecord,
  CommentThreadRecord,
  DiagnosticsPayload,
  ExecutionResult,
  EngineEvent,
  FlowDefinition,
  GitLogResult,
  GitStatusResult,
  InstalledPackageRecord,
  KalConfig,
  ProjectData,
  ReferenceEntry,
  ResourceId,
  SearchResult,
  ResourceVersionState,
  RestorableSnapshot,
  ReviewProposalRecord,
  RunBreakpointRecord,
  RunStateView,
  RunSummary,
  RunTraceRecord,
  RunView,
  SessionDefinition,
  StateDiffEntry,
  TraceTimelineEntry,
  TransactionOperation,
  TransactionOrigin,
  TransactionRecord,
} from '@/types/project';

type SaveState = {
  status: 'idle' | 'saving' | 'saved' | 'error';
  resource?: string;
  message?: string;
  updatedAt?: number;
};

type StudioResources = {
  project: ProjectData | null;
};

type VersionControlState = {
  resourceVersions: Record<string, ResourceVersionState>;
  transactions: TransactionRecord[];
  checkpoints: CheckpointRecord[];
  diagnostics: DiagnosticsPayload | null;
  diagnosticsUpdatedAt?: number;
  undoStack: SnapshotEntry[];
  redoStack: SnapshotEntry[];
};

type SnapshotEntry = {
  id: string;
  label: string;
  snapshot: RestorableSnapshot;
  activeFlowId: string | null;
  timestamp: number;
};

type CapabilityState = {
  grants: Record<StudioCapabilityId, boolean>;
};

type ExtensionRuntimeState = {
  records: Record<StudioExtensionId, StudioExtensionRuntimeRecord>;
};

type KernelState = {
  events: StudioKernelEventRecord[];
  jobs: StudioJobRecord[];
};

type WorkbenchState = {
  activeViewId: StudioViewId;
  openViewIds: StudioViewId[];
  activeFlowId: string | null;
  activePreset: StudioWorkspacePreset;
  commandPaletteOpen: boolean;
};

type ConnectionState = {
  engineConnected: boolean;
  connecting: boolean;
  connectionError: string | null;
};

type RunDebugState = {
  selectedRunId: string | null;
  runOrder: string[];
  records: Record<string, RunTraceRecord>;
  breakpoints: RunBreakpointRecord[];
};

type ReviewState = {
  activeProposalId: string | null;
  proposals: ReviewProposalRecord[];
};

type CommentsState = {
  activeThreadId: string | null;
  threads: CommentThreadRecord[];
};

type GitState = {
  status: GitStatusResult | null;
  log: GitLogResult | null;
  updatedAt?: number;
};

type PackagesState = {
  installed: InstalledPackageRecord[];
  loading: boolean;
  updatedAt?: number;
};

type PresenceStoreState = {
  users: PresenceUser[];
  activities: PresenceActivity[];
  selfId: string | null;
};

type ReferenceGraphState = {
  entries: ReferenceEntry[];
  searchResults: SearchResult | null;
  searchQuery: string;
  loading: boolean;
  updatedAt?: number;
};

type SaveScope = 'flow' | 'session' | 'project';

type StudioStore = {
  resources: StudioResources;
  workbench: WorkbenchState;
  connection: ConnectionState;
  saveState: SaveState;
  versionControl: VersionControlState;
  capabilities: CapabilityState;
  extensions: ExtensionRuntimeState;
  kernel: KernelState;
  runDebug: RunDebugState;
  review: ReviewState;
  comments: CommentsState;
  git: GitState;
  packages: PackagesState;
  presence: PresenceStoreState;
  referenceGraph: ReferenceGraphState;

  connect: () => Promise<void>;
  disconnect: () => void;
  setActiveView: (viewId: StudioViewId) => void;
  closeView: (viewId: StudioViewId) => void;
  setActivePreset: (preset: StudioWorkspacePreset) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCurrentFlow: (flowName: string) => void;
  saveFlow: (flowName: string, flow: FlowDefinition) => Promise<void>;
  createFlow: (flowName: string) => Promise<void>;
  executeFlow: (flowId: string, input?: Record<string, unknown>) => Promise<ExecutionResult>;
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
  createCheckpoint: (label?: string, description?: string) => CheckpointRecord | null;
  restoreCheckpoint: (checkpointId: string) => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
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
};

function updateSaveState(
  set: (partial: Partial<StudioStore>) => void,
  next: SaveState,
) {
  set({ saveState: next });
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const WORKBENCH_STORAGE_KEY = 'kal.studio.workbench';
const EXTENSION_RUNTIME_STORAGE_KEY = 'kal.studio.extensions';
const BREAKPOINTS_STORAGE_KEY = 'kal.studio.breakpoints';
const runStreamSubscriptions = new Map<string, () => void>();
let engineEventStreamUnsubscribe: (() => void) | null = null;

function getDefaultWorkbenchState(): WorkbenchState {
  return {
    activeViewId: DEFAULT_STUDIO_VIEW_ID,
    openViewIds: [DEFAULT_STUDIO_VIEW_ID],
    activeFlowId: null,
    activePreset: 'authoring',
    commandPaletteOpen: false,
  };
}

function loadWorkbenchState(): WorkbenchState {
  if (typeof window === 'undefined') {
    return getDefaultWorkbenchState();
  }

  try {
    const raw = window.localStorage.getItem(WORKBENCH_STORAGE_KEY);
    if (!raw) {
      return getDefaultWorkbenchState();
    }

    const parsed = JSON.parse(raw) as Partial<WorkbenchState>;
    const openViewIds =
      Array.isArray(parsed.openViewIds) && parsed.openViewIds.length > 0
        ? parsed.openViewIds
        : [DEFAULT_STUDIO_VIEW_ID];
    const activeViewId =
      typeof parsed.activeViewId === 'string' ? parsed.activeViewId : DEFAULT_STUDIO_VIEW_ID;

    return {
      activeViewId,
      openViewIds: openViewIds.includes(activeViewId) ? openViewIds : [activeViewId, ...openViewIds],
      activeFlowId: typeof parsed.activeFlowId === 'string' ? parsed.activeFlowId : null,
      activePreset:
        // Support legacy 'history' preset stored in localStorage → migrate to 'review'
        (parsed.activePreset as string) === 'history' ? 'review' :
        parsed.activePreset === 'debug' ||
        parsed.activePreset === 'review' ||
        parsed.activePreset === 'package'
          ? parsed.activePreset
          : 'authoring',
      commandPaletteOpen: false,
    };
  } catch {
    return getDefaultWorkbenchState();
  }
}

function persistWorkbenchState(workbench: WorkbenchState) {
  if (typeof window === 'undefined') {
    return;
  }

  const { commandPaletteOpen, ...persistedWorkbench } = workbench;
  void commandPaletteOpen;
  window.localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(persistedWorkbench));
}

function loadExtensionPreferences(): Record<string, { enabled: boolean }> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(EXTENSION_RUNTIME_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, { enabled?: boolean }>;
    return Object.fromEntries(
      Object.entries(parsed).map(([extensionId, value]) => [
        extensionId,
        { enabled: value.enabled !== false },
      ]),
    );
  } catch {
    return {};
  }
}

function loadCommentThreads(): CommentThreadRecord[] {
  return [];
}

function loadBreakpoints(): RunBreakpointRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(BREAKPOINTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RunBreakpointRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is RunBreakpointRecord => typeof entry?.step_id === 'string');
  } catch {
    return [];
  }
}

function persistExtensionPreferences(records: Record<StudioExtensionId, StudioExtensionRuntimeRecord>) {
  if (typeof window === 'undefined') {
    return;
  }

  const persisted = Object.fromEntries(
    Object.values(records).map((record) => [record.extensionId, { enabled: record.enabled }]),
  );
  window.localStorage.setItem(EXTENSION_RUNTIME_STORAGE_KEY, JSON.stringify(persisted));
}

function persistBreakpoints(breakpoints: RunBreakpointRecord[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(BREAKPOINTS_STORAGE_KEY, JSON.stringify(breakpoints));
}

async function loadReviewWorkspaceState(
  set: (partial: Partial<StudioStore> | ((state: StudioStore) => Partial<StudioStore>)) => void,
  get: () => StudioStore,
) {
  try {
    const review = await engineApi.getReviewState();
    set((state) => ({
      review: {
        ...state.review,
        activeProposalId:
          state.review.activeProposalId && review.proposals.some((proposal) => proposal.id === state.review.activeProposalId)
            ? state.review.activeProposalId
            : review.proposals[0]?.id ?? null,
        proposals: review.proposals,
      },
    }));
  } catch (error) {
    console.warn('Failed to load review proposals:', error);
  }

  void get;
}

async function loadCommentsWorkspaceState(
  set: (partial: Partial<StudioStore> | ((state: StudioStore) => Partial<StudioStore>)) => void,
  get: () => StudioStore,
) {
  try {
    const comments = await engineApi.getCommentsState();
    set((state) => ({
      comments: {
        ...state.comments,
        activeThreadId:
          state.comments.activeThreadId && comments.threads.some((thread) => thread.id === state.comments.activeThreadId)
            ? state.comments.activeThreadId
            : comments.threads[0]?.id ?? null,
        threads: comments.threads,
      },
    }));
  } catch (error) {
    console.warn('Failed to load comment threads:', error);
  }

  void get;
}

function syncReviewWorkspaceState(get: () => StudioStore) {
  void engineApi.saveReviewState(get().review.proposals).catch((error) => {
    console.warn('Failed to persist review proposals:', error);
  });
}

function syncCommentsWorkspaceState(get: () => StudioStore) {
  void engineApi.saveCommentsState(get().comments.threads).catch((error) => {
    console.warn('Failed to persist comment threads:', error);
  });
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getFlowResourceId(flowName: string): ResourceId {
  return `flow://${flowName}`;
}

function captureRestorableSnapshot(project: ProjectData | null): RestorableSnapshot {
  return {
    flows: cloneValue(project?.flows ?? {}),
    session: project?.session ? cloneValue(project.session) : null,
    config: project?.config ? cloneValue(project.config) : undefined,
    state: project?.state ? cloneValue(project.state) : undefined,
  };
}

function createSnapshotEntry(label: string, project: ProjectData | null, activeFlowId: string | null): SnapshotEntry {
  return {
    id: createId('snapshot'),
    label,
    snapshot: captureRestorableSnapshot(project),
    activeFlowId,
    timestamp: Date.now(),
  };
}

const DEFAULT_CAPABILITY_GRANTS: Record<StudioCapabilityId, boolean> = {
  'project.read': true,
  'project.write': true,
  'engine.execute': true,
  'engine.debug': true,
  'trace.read': true,
  'network.fetch': false,
  'process.exec': false,
  'package.install': false,
  'package.publish': false,
  'comment.write': true,
  'review.accept': true,
  'ai.invoke': false,
};

function splitCapabilityRequests(
  capabilities: ResolvedStudioCapabilityRequest[],
  grants: Record<StudioCapabilityId, boolean>,
) {
  const missingRequired: StudioCapabilityId[] = [];
  const deniedOptional: StudioCapabilityId[] = [];

  capabilities.forEach((request) => {
    if (grants[request.capability]) {
      return;
    }

    if (request.required || request.restrictedMode === 'block') {
      missingRequired.push(request.capability);
      return;
    }

    deniedOptional.push(request.capability);
  });

  return {
    missingRequired,
    deniedOptional,
  };
}

function resolveExtensionRuntimeStatus(options: {
  enabled: boolean;
  activated: boolean;
  error?: string;
  missingCapabilities: StudioCapabilityId[];
}): StudioExtensionRuntimeRecord['status'] {
  const { enabled, activated, error, missingCapabilities } = options;

  if (!enabled) {
    return 'disabled';
  }
  if (error) {
    return 'error';
  }
  if (missingCapabilities.length > 0) {
    return 'blocked';
  }
  if (activated) {
    return 'active';
  }

  return 'registered';
}

function createExtensionRuntimeRecords(
  grants: Record<StudioCapabilityId, boolean>,
  previous?: Record<StudioExtensionId, StudioExtensionRuntimeRecord>,
): Record<StudioExtensionId, StudioExtensionRuntimeRecord> {
  const preferences = loadExtensionPreferences();

  return Object.fromEntries(
    OFFICIAL_STUDIO_EXTENSIONS.map((extension) => {
      const existing = previous?.[extension.id];
      const enabled = preferences[extension.id]?.enabled ?? existing?.enabled ?? true;
      const activated = existing?.activated ?? false;
      const capabilityState = splitCapabilityRequests(extension.capabilities, grants);
      const error = existing?.error;
      const activationReason = existing?.activationReason;
      const lastActivatedAt = existing?.lastActivatedAt;

      return [
        extension.id,
        {
          extensionId: extension.id,
          enabled,
          activated,
          activationReason,
          lastActivatedAt,
          missingCapabilities: capabilityState.missingRequired,
          optionalCapabilities: capabilityState.deniedOptional,
          error,
          status: resolveExtensionRuntimeStatus({
            enabled,
            activated,
            error,
            missingCapabilities: capabilityState.missingRequired,
          }),
        },
      ];
    }),
  );
}

function assertCapability(get: () => StudioStore, capability: StudioCapabilityId) {
  if (!get().capabilities.grants[capability]) {
    throw new Error(`Capability denied: ${capability}`);
  }
}

function activateExtensionsForEvent(
  records: Record<StudioExtensionId, StudioExtensionRuntimeRecord>,
  eventName: StudioKernelEventName,
) {
  let changed = false;
  const nextRecords = { ...records };

  OFFICIAL_STUDIO_EXTENSIONS.forEach((extension) => {
    const current = records[extension.id];
    if (!current || !current.enabled || current.missingCapabilities.length > 0) {
      return;
    }

    const matches = extension.activationEvents.includes(`onEvent:${eventName}`);
    if (!matches) {
      return;
    }

    changed = true;
    nextRecords[extension.id] = {
      ...current,
      activated: true,
      activationReason: `event:${eventName}`,
      lastActivatedAt: Date.now(),
      status: resolveExtensionRuntimeStatus({
        enabled: current.enabled,
        activated: true,
        error: current.error,
        missingCapabilities: current.missingCapabilities,
      }),
    };
  });

  return changed ? nextRecords : records;
}

function appendKernelEvent(
  state: StudioStore,
  event: Omit<StudioKernelEventRecord, 'id' | 'timestamp'> & Partial<Pick<StudioKernelEventRecord, 'id' | 'timestamp'>>,
) {
  const record: StudioKernelEventRecord = {
    id: event.id ?? createId('evt'),
    timestamp: event.timestamp ?? Date.now(),
    ...event,
  };

  return {
    kernel: {
      ...state.kernel,
      events: [record, ...state.kernel.events].slice(0, 200),
    },
    extensions: {
      records: activateExtensionsForEvent(state.extensions.records, record.type),
    },
  };
}

function upsertJob(
  jobs: StudioJobRecord[],
  nextJob: StudioJobRecord,
) {
  const existingIndex = jobs.findIndex((job) => job.id === nextJob.id);
  if (existingIndex === -1) {
    return [nextJob, ...jobs].slice(0, 20);
  }

  const copy = [...jobs];
  copy[existingIndex] = nextJob;
  return copy.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 20);
}

function createJobRecord(id: string, title: string, detail?: string): StudioJobRecord {
  const now = Date.now();
  return {
    id,
    title,
    detail,
    status: 'running',
    progress: 5,
    startedAt: now,
    updatedAt: now,
  };
}

function summarizeRunEvent(event: RunView['recent_events'][number]): { title: string; detail?: string; changedKeys: string[] } {
  if (event.type === 'output') {
    return {
      title: i18n.t('store:stepOutput', { stepId: event.step_id }),
      detail: event.normalized.narration ?? event.flow_id ?? 'run output',
      changedKeys: Object.keys(event.normalized.state_changes ?? {}),
    };
  }

  return {
    title: i18n.t('store:runEnded'),
    detail: event.message ?? 'Session ended',
    changedKeys: [],
  };
}

function summarizeRunInput(input: RunView['input_history'][number]) {
  return {
    title: i18n.t('store:stepInput', { stepId: input.step_id }),
    detail: input.input,
  };
}

function resolveRunStepId(run: Pick<RunView, 'cursor' | 'waiting_for'>): string | null {
  return run.waiting_for?.step_id ?? run.cursor.currentStepId ?? null;
}

function hasBreakpoint(breakpoints: RunBreakpointRecord[], stepId?: string | null): boolean {
  if (!stepId) {
    return false;
  }

  return breakpoints.some((entry) => entry.step_id === stepId);
}

function createBreakpointTimelineEntry(
  runId: string,
  stepId: string,
  status: RunView['status'],
  timestamp = Date.now(),
): TraceTimelineEntry {
  return {
    id: `${runId}:breakpoint:${stepId}:${timestamp}`,
    run_id: runId,
    timestamp,
    source: 'annotation',
    eventType: 'run.breakpoint',
    title: `Breakpoint Hit · ${stepId}`,
    detail: i18n.t('store:breakpointHitDetail'),
    status,
    cursorStepId: stepId,
    waitingFor: stepId,
    changedKeys: [],
  };
}

function appendTimelineAnnotation(
  annotations: TraceTimelineEntry[],
  entry: TraceTimelineEntry,
): TraceTimelineEntry[] {
  if (annotations.some((candidate) => candidate.id === entry.id)) {
    return annotations;
  }

  return [entry, ...annotations].sort((left, right) => right.timestamp - left.timestamp).slice(0, 40);
}

function markBreakpointHit(
  breakpoints: RunBreakpointRecord[],
  stepId: string,
  timestamp: number,
): RunBreakpointRecord[] {
  return breakpoints.map((entry) =>
    entry.step_id === stepId
      ? {
          ...entry,
          hit_count: entry.hit_count + 1,
          last_hit_at: timestamp,
        }
      : entry,
  );
}

function buildTraceTimeline(
  run: RunView,
  state?: RunStateView,
  annotations: TraceTimelineEntry[] = [],
): TraceTimelineEntry[] {
  const recentEvents = run.recent_events ?? [];
  const inputHistory = run.input_history ?? [];
  const baseTimestamp = run.updated_at || Date.now();
  const snapshotEntry: TraceTimelineEntry = {
    id: `${run.run_id}:state:${baseTimestamp}`,
    run_id: run.run_id,
    timestamp: baseTimestamp,
    source: 'snapshot',
    eventType: 'run.state',
    title: `Run Snapshot · ${run.status}`,
    detail: run.waiting_for
      ? `${run.waiting_for.kind} @ ${run.waiting_for.step_id}`
      : 'no pending input',
    status: run.status,
    cursorStepId: run.cursor.currentStepId,
    waitingFor: run.waiting_for?.step_id ?? null,
    changedKeys: state?.state_summary.changed ?? run.state_summary.changed ?? [],
  };

  const eventEntries = recentEvents.map((event, index) => {
    const summary = summarizeRunEvent(event);
    return {
      id: `${run.run_id}:event:${index}:${event.type}`,
      run_id: run.run_id,
      timestamp: Math.max(run.created_at, baseTimestamp - (recentEvents.length - index) * 1000),
      source: 'snapshot' as const,
      eventType: event.type,
      title: summary.title,
      detail: summary.detail,
      status: run.status,
      cursorStepId: run.cursor.currentStepId,
      waitingFor: run.waiting_for?.step_id ?? null,
      changedKeys: summary.changedKeys,
    };
  });

  const inputEntries = inputHistory.map((entry, index) => {
    const summary = summarizeRunInput(entry);
    return {
      id: `${run.run_id}:input:${index}:${entry.timestamp}`,
      run_id: run.run_id,
      timestamp: entry.timestamp,
      source: 'snapshot' as const,
      eventType: 'run.input' as const,
      title: summary.title,
      detail: summary.detail,
      status: run.status,
      cursorStepId: entry.step_id,
      waitingFor: entry.step_id,
      changedKeys: [],
    };
  });

  return [...annotations, ...eventEntries, ...inputEntries, snapshotEntry]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 200);
}

function buildStateDiff(runState: RunStateView): StateDiffEntry[] {
  return Object.entries(runState.state_summary.changed_values ?? {}).map(([key, value]) => ({
    key,
    before: value.old,
    after: value.new,
  }));
}

function mergeRunTraceRecord(
  existing: RunTraceRecord | undefined,
  run: RunView,
  state?: RunStateView,
  options?: { subscribed?: boolean; resourceVersion?: number },
): RunTraceRecord {
  const nextState = state ?? existing?.state;
  const annotations = existing?.annotations ?? [];
  return {
    runId: run.run_id,
    run,
    state: nextState,
    timeline: buildTraceTimeline(run, nextState, annotations),
    annotations,
    stateDiff: nextState ? buildStateDiff(nextState) : existing?.stateDiff ?? [],
    updatedAt: Date.now(),
    subscribed: options?.subscribed ?? existing?.subscribed ?? false,
    resourceVersion: existing?.resourceVersion ?? options?.resourceVersion,
  };
}

async function continueRunWithBreakpoints(options: {
  get: () => StudioStore;
  runId: string;
  input?: string;
  seedRun?: RunView;
  updateProgress?: (progress: number, detail?: string) => void;
  skipInitialStepComparison?: boolean;
}): Promise<{ run: RunView; breakpointStepId?: string }> {
  const { get, runId, input, seedRun, updateProgress, skipInitialStepComparison = false } = options;
  const breakpoints = get().runDebug.breakpoints;
  if (breakpoints.length === 0) {
    const run = seedRun ?? await engineApi.getRun(runId);
    return { run };
  }

  const initialRun = seedRun ?? await engineApi.getRun(runId);
  let currentRun = initialRun;
  let pendingInput = input;
  let previousStepId = skipInitialStepComparison
    ? null
    : resolveRunStepId(initialRun);
  let iterations = 0;
  const maxIterations = 128;

  const maybeHitBreakpoint = (run: RunView) => {
    const stepId = resolveRunStepId(run);
    if (!stepId || !hasBreakpoint(breakpoints, stepId)) {
      return undefined;
    }
    if (previousStepId && stepId === previousStepId) {
      return undefined;
    }
    return stepId;
  };

  const initialBreakpoint = maybeHitBreakpoint(currentRun);
  if (initialBreakpoint) {
    return { run: currentRun, breakpointStepId: initialBreakpoint };
  }
  if (currentRun.status === 'waiting_input' || currentRun.status === 'ended' || currentRun.status === 'error') {
    return { run: currentRun };
  }

  while (iterations < maxIterations) {
    iterations += 1;
    updateProgress?.(
      Math.min(90, 25 + iterations * 6),
      i18n.t('store:stepAdvancing', { iterations, withInput: pendingInput !== undefined ? i18n.t('store:withInput') : '' }),
    );
    currentRun = await engineApi.advanceRun(runId, pendingInput, 'step');
    pendingInput = undefined;

    const breakpointStepId = maybeHitBreakpoint(currentRun);
    if (breakpointStepId) {
      return { run: currentRun, breakpointStepId };
    }
    if (currentRun.status === 'waiting_input' || currentRun.status === 'ended' || currentRun.status === 'error') {
      return { run: currentRun };
    }

    previousStepId = resolveRunStepId(currentRun);
  }

  throw new Error(i18n.t('store:continueBreakpointLimit'));
}

function ensureRunOrder(runOrder: string[], runId: string): string[] {
  return [runId, ...runOrder.filter((candidate) => candidate !== runId)];
}

function summarizeDiagnostics(diagnostics: DiagnosticsPayload | null | undefined) {
  return {
    totalIssues: diagnostics?.summary.total_issues ?? 0,
    errors: diagnostics?.summary.errors ?? 0,
    warnings: diagnostics?.summary.warnings ?? 0,
  };
}

function deriveTouchedResources(transactions: TransactionRecord[], checkpoint?: CheckpointRecord | null): ResourceId[] {
  const candidates = checkpoint
    ? transactions.filter((transaction) => transaction.timestamp >= checkpoint.createdAt)
    : transactions.slice(0, 8);
  const resources = new Set<ResourceId>();
  candidates.forEach((transaction) => {
    resources.add(transaction.resourceId);
    transaction.operations.forEach((operation) => resources.add(operation.resourceId));
  });
  return [...resources];
}

function deriveRiskNotes(options: {
  summary: ReturnType<typeof compareSnapshot>;
  diagnostics: DiagnosticsPayload | null;
  selectedRun?: RunTraceRecord | null;
}) {
  const notes: string[] = [];
  if (options.summary.changedFlows.length > 0) {
    notes.push(i18n.t('store:riskNotes.flowChanges', { count: options.summary.changedFlows.length }));
  }
  if (options.summary.sessionChanged) {
    notes.push(i18n.t('store:riskNotes.sessionChanged'));
  }
  if ((options.diagnostics?.summary.errors ?? 0) > 0) {
    notes.push(i18n.t('store:riskNotes.diagnosticsErrors'));
  }
  if (options.selectedRun?.stateDiff.length) {
    notes.push(i18n.t('store:riskNotes.stateDiffKeys', { count: options.selectedRun.stateDiff.length }));
  }
  if (notes.length === 0) {
    notes.push(i18n.t('store:riskNotes.lowRisk'));
  }
  return notes;
}

async function fetchDiagnosticsReport(): Promise<DiagnosticsPayload | null> {
  try {
    return await engineApi.getDiagnostics();
  } catch {
    return null;
  }
}

async function restoreProjectSnapshot(snapshot: RestorableSnapshot, currentProject: ProjectData, previousFlow: string | null) {
  for (const [flowName, flow] of Object.entries(snapshot.flows)) {
    await engineApi.saveFlow(flowName, flow);
  }

  for (const flowName of Object.keys(currentProject.flows)) {
    if (!snapshot.flows[flowName]) {
      await engineApi.deleteFlow(flowName);
    }
  }

  if (snapshot.session) {
    await engineApi.saveSession(snapshot.session);
  } else if (currentProject.session) {
    await engineApi.deleteSession();
  }

  if (snapshot.config) {
    await engineApi.saveConfig(snapshot.config);
  }

  return loadProjectSnapshot(previousFlow);
}

function initializeResourceVersions(
  project: ProjectData,
  previous: Record<string, ResourceVersionState>,
): Record<string, ResourceVersionState> {
  const now = Date.now();
  const resourceIds: ResourceId[] = [
    'project://current',
    'config://project',
    'state://project',
    'session://default',
    ...Object.keys(project.flows).map((flowName) => getFlowResourceId(flowName)),
  ];

  return Object.fromEntries(
    resourceIds.map((resourceId) => {
      const existing = previous[resourceId];
      return [
        resourceId,
        existing ?? {
          resourceId,
          version: 1,
          updatedAt: now,
        },
      ];
    }),
  );
}

function nextVersionState(
  state: StudioStore,
  resourceId: ResourceId,
  transactionId: string,
): ResourceVersionState {
  const current = state.versionControl.resourceVersions[resourceId];
  const nextVersion = (current?.version ?? 0) + 1;

  return {
    resourceId,
    version: nextVersion,
    updatedAt: Date.now(),
    lastTransactionId: transactionId,
  };
}

async function commitTransaction<T>(options: {
  set: (updater: Partial<StudioStore> | ((state: StudioStore) => Partial<StudioStore>)) => void;
  get: () => StudioStore;
  scope: SaveScope;
  resource: ResourceId;
  saveLabel: string;
  origin?: TransactionOrigin;
  operations: TransactionOperation[];
  action: () => Promise<T>;
  updateProject?: (project: ProjectData) => ProjectData;
}): Promise<T> {
  const {
    set,
    get,
    scope,
    resource,
    saveLabel,
    operations,
    action,
    updateProject,
    origin = { kind: 'user', id: 'studio.user', label: 'Studio User' },
  } = options;

  const baseVersion = get().versionControl.resourceVersions[resource]?.version ?? 0;
  const beforeSnapshot = createSnapshotEntry(saveLabel, get().resources.project, get().workbench.activeFlowId);

  return withSaveState(set, scope, saveLabel, async () => {
    const result = await action();
    const diagnostics = await fetchDiagnosticsReport();

    set((state) => {
      const currentProject = state.resources.project;
      const nextProject = currentProject && updateProject ? updateProject(currentProject) : currentProject;
      const transactionId = createId('tx');
      const nextVersion = nextVersionState(state, resource, transactionId);
      const transaction: TransactionRecord = {
        id: transactionId,
        resourceId: resource,
        baseVersion,
        nextVersion: nextVersion.version,
        timestamp: nextVersion.updatedAt,
        origin,
        operations,
      };

      return {
        resources: nextProject
          ? {
              ...state.resources,
              project: nextProject,
            }
          : state.resources,
        versionControl: {
          ...state.versionControl,
          resourceVersions: {
            ...state.versionControl.resourceVersions,
            [resource]: nextVersion,
          },
          diagnostics,
          diagnosticsUpdatedAt: diagnostics ? Date.now() : state.versionControl.diagnosticsUpdatedAt,
          transactions: [transaction, ...state.versionControl.transactions].slice(0, 100),
          undoStack: [beforeSnapshot, ...state.versionControl.undoStack].slice(0, 50),
          redoStack: [],
        },
      };
    });

    const operationSummary = operations[0]?.summary ?? saveLabel;
    get().recordKernelEvent({
      type: 'resource.changed',
      message: operationSummary,
      resourceId: resource,
      data: { operations: operations.map((operation) => operation.type) },
    });
    get().recordKernelEvent({
      type: 'history.updated',
          message: i18n.t('store:transactionWritten', { summary: operationSummary }),
      resourceId: resource,
    });
    get().recordKernelEvent({
      type: 'diagnostics.updated',
      message: i18n.t('store:diagnosticsRefreshed'),
      resourceId: 'project://current',
    });

    return result;
  });
}

async function withSaveState<T>(
  set: (partial: Partial<StudioStore>) => void,
  scope: SaveScope,
  resource: string,
  action: () => Promise<T>,
): Promise<T> {
  updateSaveState(set, {
    status: 'saving',
    resource,
    updatedAt: Date.now(),
  });

  try {
    const result = await action();
    updateSaveState(set, {
      status: 'saved',
      resource,
      updatedAt: Date.now(),
      message: `${scope} saved`,
    });
    return result;
  } catch (error) {
    updateSaveState(set, {
      status: 'error',
      resource,
      updatedAt: Date.now(),
      message: (error as Error).message,
    });
    throw error;
  }
}

async function withJob<T>(options: {
  set: (updater: Partial<StudioStore> | ((state: StudioStore) => Partial<StudioStore>)) => void;
  get: () => StudioStore;
  id?: string;
  title: string;
  detail?: string;
  action: (updateProgress: (progress: number, detail?: string) => void) => Promise<T>;
}): Promise<T> {
  const { set, id = createId('job'), title, detail, action } = options;
  const started = createJobRecord(id, title, detail);

  set((state) => ({
    kernel: {
      ...state.kernel,
      jobs: upsertJob(state.kernel.jobs, started),
      events: [
        {
          id: createId('evt'),
          type: 'job.updated' as const,
          timestamp: started.startedAt,
          message: i18n.t('store:jobStarted', { title }),
          jobId: id,
          data: { progress: started.progress, status: started.status },
        },
        ...state.kernel.events,
      ].slice(0, 200),
    },
  }));

  const updateProgress = (progress: number, nextDetail = detail) => {
    set((state) => {
      const current = state.kernel.jobs.find((job) => job.id === id) ?? started;
      const nextJob: StudioJobRecord = {
        ...current,
        detail: nextDetail,
        progress,
        updatedAt: Date.now(),
      };

      return {
        kernel: {
          ...state.kernel,
          jobs: upsertJob(state.kernel.jobs, nextJob),
          events: [
            {
              id: createId('evt'),
              type: 'job.updated' as const,
              timestamp: nextJob.updatedAt,
              message: i18n.t('store:jobProgress', { title, progress }),
              jobId: id,
              data: { progress, status: nextJob.status, detail: nextDetail },
            },
            ...state.kernel.events,
          ].slice(0, 200),
        },
      };
    });
  };

  try {
    const result = await action(updateProgress);
    set((state) => {
      const current = state.kernel.jobs.find((job) => job.id === id) ?? started;
      const completedAt = Date.now();
      const nextJob: StudioJobRecord = {
        ...current,
        detail: current.detail ?? detail,
        status: 'completed',
        progress: 100,
        updatedAt: completedAt,
        completedAt,
      };

      return {
        kernel: {
          ...state.kernel,
          jobs: upsertJob(state.kernel.jobs, nextJob),
          events: [
            {
              id: createId('evt'),
              type: 'job.updated' as const,
              timestamp: completedAt,
              message: i18n.t('store:jobCompleted', { title }),
              jobId: id,
              data: { progress: 100, status: 'completed' },
            },
            ...state.kernel.events,
          ].slice(0, 200),
        },
      };
    });
    return result;
  } catch (error) {
    set((state) => {
      const current = state.kernel.jobs.find((job) => job.id === id) ?? started;
      const failedAt = Date.now();
      const nextJob: StudioJobRecord = {
        ...current,
        detail: (error as Error).message,
        status: 'failed',
        updatedAt: failedAt,
        completedAt: failedAt,
      };

      return {
        kernel: {
          ...state.kernel,
          jobs: upsertJob(state.kernel.jobs, nextJob),
          events: [
            {
              id: createId('evt'),
              type: 'job.updated' as const,
              timestamp: failedAt,
              message: i18n.t('store:jobFailed', { title, message: (error as Error).message }),
              jobId: id,
              data: { progress: nextJob.progress, status: 'failed' },
            },
            ...state.kernel.events,
          ].slice(0, 200),
        },
      };
    });
    throw error;
  }
}

async function loadProjectSnapshot(previousFlow: string | null): Promise<{
  project: ProjectData;
  currentFlow: string | null;
}> {
  const [projectInfo, flowList, nodeManifests, config, state, session] = await Promise.all([
    engineApi.getProject(),
    engineApi.listFlows(),
    engineApi.getNodes(),
    engineApi.getConfig(),
    engineApi.getState(),
    engineApi.getSession(),
  ]);

  const flows = Object.fromEntries(
    await Promise.all(
      flowList.map(async (item) => [item.id, await engineApi.getFlow(item.id)] as const),
    ),
  );

  const project: ProjectData = {
    name: projectInfo.name,
    config,
    flows,
    state,
    session,
    nodeManifests,
  };

  const flowIds = Object.keys(flows);
  const currentFlow =
    previousFlow && flows[previousFlow]
      ? previousFlow
      : flowIds[0] ?? null;

  return { project, currentFlow };
}

async function hydrateRunRecord(
  runId: string,
  options?: { withState?: boolean },
): Promise<RunTraceRecord> {
  const run = await engineApi.getRun(runId);
  const state = options?.withState === false ? undefined : await engineApi.getRunState(runId);
  return mergeRunTraceRecord(undefined, run, state);
}

function stopAllRunSubscriptions() {
  for (const unsubscribe of runStreamSubscriptions.values()) {
    unsubscribe();
  }
  runStreamSubscriptions.clear();
}

function attachRunSubscription(
  set: (updater: Partial<StudioStore> | ((state: StudioStore) => Partial<StudioStore>)) => void,
  get: () => StudioStore,
  runId: string,
) {
  if (runStreamSubscriptions.has(runId)) {
    return;
  }

  const unsubscribe = engineApi.subscribeRun(runId, (event) => {
    set((state) => {
      const existing = state.runDebug.records[runId];
      const nextRecord = mergeRunTraceRecord(existing, event.run, existing?.state, { subscribed: true });
      return {
        runDebug: {
          ...state.runDebug,
          selectedRunId: state.runDebug.selectedRunId ?? runId,
          runOrder: ensureRunOrder(state.runDebug.runOrder, runId),
          records: {
            ...state.runDebug.records,
            [runId]: nextRecord,
          },
        },
      };
    });

    get().recordKernelEvent({
      type: event.type === 'run.invalidated' ? 'run.updated' : event.type,
      message: i18n.t('store:runReceived', { runId, eventType: event.type }),
      runId,
      data: { status: event.run.status, recentEvents: event.run.recent_events.length },
    });

    if (event.type !== 'run.cancelled' && get().capabilities.grants['trace.read']) {
      void engineApi.getRunState(runId).then((stateView) => {
        set((state) => ({
          runDebug: {
            ...state.runDebug,
            records: {
              ...state.runDebug.records,
              [runId]: mergeRunTraceRecord(state.runDebug.records[runId], event.run, stateView, {
                subscribed: true,
              }),
            },
          },
        }));
      }).catch(() => {
        // Keep last known snapshot if state hydration fails.
      });
    }
  });

  runStreamSubscriptions.set(runId, unsubscribe);
}

function recordBreakpointHit(options: {
  set: (updater: Partial<StudioStore> | ((state: StudioStore) => Partial<StudioStore>)) => void;
  get: () => StudioStore;
  runId: string;
  run: RunView;
  stepId: string;
}) {
  const { set, get, runId, run, stepId } = options;
  const timestamp = Date.now();
  const annotation = createBreakpointTimelineEntry(runId, stepId, run.status, timestamp);

  set((state) => {
    const existing = state.runDebug.records[runId];
    if (!existing) {
      return {
        runDebug: {
          ...state.runDebug,
          breakpoints: markBreakpointHit(state.runDebug.breakpoints, stepId, timestamp),
        },
      };
    }

    const annotations = appendTimelineAnnotation(existing.annotations ?? [], annotation);
    return {
      runDebug: {
        ...state.runDebug,
        breakpoints: markBreakpointHit(state.runDebug.breakpoints, stepId, timestamp),
        records: {
          ...state.runDebug.records,
          [runId]: {
            ...existing,
            annotations,
            timeline: buildTraceTimeline(run, existing.state, annotations),
            updatedAt: timestamp,
          },
        },
      },
    };
  });

  get().recordKernelEvent({
    type: 'run.breakpoint.hit',
    message: i18n.t('store:breakpointHit', { runId, stepId }),
    runId,
    data: { stepId },
  });
}

export const useStudioStore = create<StudioStore>((set, get) => ({
  resources: {
    project: null,
  },
  workbench: loadWorkbenchState(),
  connection: {
    engineConnected: false,
    connecting: false,
    connectionError: null,
  },
  saveState: {
    status: 'idle',
  },
  versionControl: {
    resourceVersions: {},
    transactions: [],
    checkpoints: [],
    diagnostics: null,
    undoStack: [],
    redoStack: [],
  },
  capabilities: {
    grants: DEFAULT_CAPABILITY_GRANTS,
  },
  extensions: {
    records: createExtensionRuntimeRecords(DEFAULT_CAPABILITY_GRANTS),
  },
  kernel: {
    events: [],
    jobs: [],
  },
  runDebug: {
    selectedRunId: null,
    runOrder: [],
    records: {},
    breakpoints: loadBreakpoints(),
  },
  review: {
    activeProposalId: null,
    proposals: [],
  },
  comments: {
    activeThreadId: null,
    threads: loadCommentThreads(),
  },
  git: {
    status: null,
    log: null,
  },
  packages: {
    installed: [],
    loading: false,
  },
  presence: {
    users: [],
    activities: [],
    selfId: null,
  },
  referenceGraph: {
    entries: [],
    searchResults: null,
    searchQuery: '',
    loading: false,
  },

  connect: async () => {
    set({
      connection: {
        engineConnected: false,
        connecting: true,
        connectionError: null,
      },
    });

    try {
      await withJob({
        set,
        get,
        title: i18n.t('store:connectEngine'),
        detail: i18n.t('store:connectEngineDetail'),
        action: async (updateProgress) => {
          updateProgress(25, i18n.t('store:fetchSnapshot'));
          const projectTask = loadProjectSnapshot(get().workbench.activeFlowId);
          const diagnosticsTask = fetchDiagnosticsReport();
          const [{ project, currentFlow }, diagnostics] = await Promise.all([projectTask, diagnosticsTask]);
          updateProgress(85, i18n.t('store:syncWorkbench'));

          set((state) => ({
            resources: {
              ...state.resources,
              project,
            },
            workbench: {
              ...state.workbench,
              activeFlowId: currentFlow,
            },
            connection: {
              engineConnected: true,
              connecting: false,
              connectionError: null,
            },
            versionControl: {
              ...state.versionControl,
              resourceVersions: initializeResourceVersions(project, state.versionControl.resourceVersions),
              diagnostics,
              diagnosticsUpdatedAt: diagnostics ? Date.now() : state.versionControl.diagnosticsUpdatedAt,
            },
            extensions: {
              records: createExtensionRuntimeRecords(state.capabilities.grants, state.extensions.records),
            },
          }));
        },
      });

      get().recordKernelEvent({
        type: 'project.connected',
        message: i18n.t('store:studioConnected'),
        resourceId: 'project://current',
      });
      get().recordKernelEvent({
        type: 'diagnostics.updated',
        message: i18n.t('store:initialDiagnosticsSynced'),
        resourceId: 'project://current',
      });
      if (get().capabilities.grants['trace.read']) {
        await get().refreshRuns().catch(() => {
          // Keep workbench usable even if run catalog hydration fails.
        });
      }

      // Subscribe to unified event stream
      engineEventStreamUnsubscribe = engineApi.subscribeEvents((event: EngineEvent) => {
        const store = get();
        if (event.type === 'resource.changed') {
          // Auto-reload affected resources
          if (event.flowId && store.resources.project) {
            void engineApi.getFlow(event.flowId).then((flow) => {
              set((state) => ({
                resources: {
                  project: state.resources.project
                    ? {
                        ...state.resources.project,
                        flows: { ...state.resources.project.flows, [event.flowId!]: flow },
                      }
                    : null,
                },
              }));
            });
          }
          if (event.resourceId === 'review://proposals') {
            void loadReviewWorkspaceState(set, get);
          }
          if (event.resourceId === 'comments://threads') {
            void loadCommentsWorkspaceState(set, get);
          }
          store.recordKernelEvent({
            type: 'resource.changed',
            message: event.message ?? 'Resource changed',
            resourceId:
              event.flowId
                ? `flow://${event.flowId}`
                : event.sessionId
                  ? 'session://default'
                  : (event.resourceId as ResourceId | undefined),
          });
        } else if (event.type === 'project.reloaded') {
          void store.reloadProject();
        } else if (event.type === 'diagnostics.updated') {
          void store.refreshDiagnostics();
        }
      });

      // Fetch initial git status
      await get().refreshGitStatus().catch(() => {
        // Git not available, continue without it
      });

      // Fetch initial packages
      await get().loadPackages().catch(() => {
        // Packages not available, continue without them
      });

      await Promise.all([
        loadReviewWorkspaceState(set, get),
        loadCommentsWorkspaceState(set, get),
      ]);
    } catch (error) {
      const message = (error as Error).message;
      set({
        connection: {
          engineConnected: false,
          connecting: false,
          connectionError: message,
        },
      });
      throw error;
    }
  },

  disconnect: () => {
    stopAllRunSubscriptions();
    if (engineEventStreamUnsubscribe) {
      engineEventStreamUnsubscribe();
      engineEventStreamUnsubscribe = null;
    }
    set((state) => ({
      resources: { project: null },
      workbench: {
        ...state.workbench,
        activeFlowId: null,
        commandPaletteOpen: false,
      },
      connection: {
        engineConnected: false,
        connecting: false,
        connectionError: null,
      },
      saveState: { status: 'idle' },
      versionControl: {
        ...state.versionControl,
        resourceVersions: {},
        diagnostics: null,
      },
      extensions: {
        records: createExtensionRuntimeRecords(state.capabilities.grants, state.extensions.records),
      },
      runDebug: {
        selectedRunId: null,
        runOrder: [],
        records: {},
        breakpoints: state.runDebug.breakpoints,
      },
      review: {
        activeProposalId: null,
        proposals: [],
      },
      comments: {
        activeThreadId: null,
        threads: [],
      },
      git: { status: null, log: null },
      packages: { installed: [], loading: false },
      presence: { users: [], activities: [], selfId: null },
    }));
    get().recordKernelEvent({
      type: 'project.disconnected',
      message: i18n.t('store:studioDisconnected'),
    });
  },

  setActiveView: (viewId) => {
    const extension = getStudioExtensionForView(viewId);

    set((state) => {
      const nextRecords = extension
        ? {
            ...state.extensions.records,
            [extension.id]: {
              ...state.extensions.records[extension.id],
              activated: true,
              activationReason: `view:${viewId}`,
              lastActivatedAt: Date.now(),
              status: resolveExtensionRuntimeStatus({
                enabled: state.extensions.records[extension.id]?.enabled ?? true,
                activated: true,
                error: state.extensions.records[extension.id]?.error,
                missingCapabilities: state.extensions.records[extension.id]?.missingCapabilities ?? [],
              }),
            },
          }
        : state.extensions.records;

      return {
        workbench: {
          ...state.workbench,
          activeViewId: viewId,
          openViewIds: state.workbench.openViewIds.includes(viewId)
            ? state.workbench.openViewIds
            : [...state.workbench.openViewIds, viewId],
        },
        extensions: {
          records: nextRecords,
        },
      };
    });
  },

  closeView: (viewId) => {
    set((state) => {
      const openViewIds = state.workbench.openViewIds.filter((candidate) => candidate !== viewId);
      if (openViewIds.length === 0) {
        return state;
      }

      return {
        workbench: {
          ...state.workbench,
          openViewIds,
          activeViewId:
            state.workbench.activeViewId === viewId
              ? openViewIds[openViewIds.length - 1]!
              : state.workbench.activeViewId,
        },
      };
    });
  },

  setActivePreset: (preset) => {
    set((state) => {
      const allViews = getAllViews();
      const presetViews = allViews.filter(
        (v) => !v.presets || v.presets.includes(preset),
      );
      const presetViewIds = new Set(presetViews.map((v) => v.id));

      // Keep only open views that belong to the new preset
      const filteredOpenIds = state.workbench.openViewIds.filter((id) =>
        presetViewIds.has(id),
      );

      // If active view doesn't belong to new preset, pick the first available
      const activeStillValid = presetViewIds.has(state.workbench.activeViewId);
      const fallbackViewId = presetViews[0]?.id ?? DEFAULT_STUDIO_VIEW_ID;
      const nextActiveId = activeStillValid
        ? state.workbench.activeViewId
        : filteredOpenIds[0] ?? fallbackViewId;

      const nextOpenIds =
        filteredOpenIds.length > 0
          ? filteredOpenIds.includes(nextActiveId)
            ? filteredOpenIds
            : [nextActiveId, ...filteredOpenIds]
          : [nextActiveId];

      return {
        workbench: {
          ...state.workbench,
          activePreset: preset,
          activeViewId: nextActiveId,
          openViewIds: nextOpenIds,
        },
      };
    });
  },

  setCommandPaletteOpen: (open) => {
    set((state) => ({
      workbench: {
        ...state.workbench,
        commandPaletteOpen: open,
      },
    }));
  },

  toggleCommandPalette: () => {
    set((state) => ({
      workbench: {
        ...state.workbench,
        commandPaletteOpen: !state.workbench.commandPaletteOpen,
      },
    }));
  },

  setCurrentFlow: (flowName) => {
    set((state) => ({
      workbench: {
        ...state.workbench,
        activeViewId: 'kal.flow',
        activeFlowId: flowName,
        openViewIds: state.workbench.openViewIds.includes('kal.flow')
          ? state.workbench.openViewIds
          : [...state.workbench.openViewIds, 'kal.flow'],
      },
      extensions: {
        records: {
          ...state.extensions.records,
          'kal.flow-editor': {
            ...state.extensions.records['kal.flow-editor'],
            activated: true,
            activationReason: `flow:${flowName}`,
            lastActivatedAt: Date.now(),
            status: resolveExtensionRuntimeStatus({
              enabled: state.extensions.records['kal.flow-editor']?.enabled ?? true,
              activated: true,
              error: state.extensions.records['kal.flow-editor']?.error,
              missingCapabilities:
                state.extensions.records['kal.flow-editor']?.missingCapabilities ?? [],
            }),
          },
        },
      },
    }));
  },

  saveFlow: async (flowName, flow) => {
    const project = get().resources.project;
    if (!project) return;
    assertCapability(get, 'project.write');

    await commitTransaction({
      set,
      get,
      scope: 'flow',
      resource: getFlowResourceId(flowName),
      saveLabel: flowName,
      operations: [
        {
          type: 'flow.save',
          resourceId: getFlowResourceId(flowName),
          summary: i18n.t('store:saveFlow', { name: flowName }),
        },
      ],
      action: () => engineApi.saveFlow(flowName, flow),
      updateProject: (currentProject) => ({
        ...currentProject,
        flows: {
          ...currentProject.flows,
          [flowName]: cloneValue(flow),
        },
      }),
    });
  },

  createFlow: async (flowName) => {
    const project = get().resources.project;
    if (!project) return;
    assertCapability(get, 'project.write');

    if (project.flows[flowName]) {
      throw new Error(`Flow "${flowName}" already exists`);
    }

    const newFlow: FlowDefinition = {
      meta: { schemaVersion: '1.0.0' },
      data: { nodes: [], edges: [] },
    };

    await commitTransaction({
      set,
      get,
      scope: 'flow',
      resource: getFlowResourceId(flowName),
      saveLabel: flowName,
      operations: [
        {
          type: 'flow.create',
          resourceId: getFlowResourceId(flowName),
          summary: i18n.t('store:createFlow', { name: flowName }),
        },
      ],
      action: () => engineApi.saveFlow(flowName, newFlow),
      updateProject: (currentProject) => ({
        ...currentProject,
        flows: {
          ...currentProject.flows,
          [flowName]: cloneValue(newFlow),
        },
      }),
    });

    set((state) => ({
      workbench: {
        ...state.workbench,
        activeViewId: 'kal.flow',
        activeFlowId: flowName,
        openViewIds: state.workbench.openViewIds.includes('kal.flow')
          ? state.workbench.openViewIds
          : [...state.workbench.openViewIds, 'kal.flow'],
      },
    }));
  },

  executeFlow: async (flowId, input = {}) => {
    assertCapability(get, 'engine.execute');
    return engineApi.executeFlow(flowId, input);
  },

  reloadProject: async () => {
    assertCapability(get, 'project.read');
    await withJob({
      set,
      get,
      title: i18n.t('store:reloadProject'),
      detail: i18n.t('store:reloadProjectDetail'),
      action: async (updateProgress) => {
        updateProgress(20, i18n.t('store:requestEngineReload'));
        await commitTransaction({
          set,
          get,
          scope: 'project',
          resource: 'project://current',
          saveLabel: 'project',
          origin: { kind: 'system', id: 'studio.reload', label: 'Project Reload' },
          operations: [
            {
              type: 'project.reload',
              resourceId: 'project://current',
              summary: i18n.t('store:reloadProjectSnapshot'),
            },
          ],
          action: async () => {
            await engineApi.reloadProject();
            updateProgress(60, i18n.t('store:refetchSnapshot'));
            return loadProjectSnapshot(get().workbench.activeFlowId);
          },
        }).then(({ project, currentFlow }) => {
          set((state) => ({
            resources: {
              ...state.resources,
              project,
            },
            workbench: {
              ...state.workbench,
              activeFlowId: currentFlow,
            },
            versionControl: {
              ...state.versionControl,
              resourceVersions: initializeResourceVersions(project, state.versionControl.resourceVersions),
            },
          }));
        });
      },
    });

    get().recordKernelEvent({
      type: 'project.reloaded',
      message: i18n.t('store:projectReloaded'),
      resourceId: 'project://current',
    });
  },

  saveSession: async (session) => {
    const project = get().resources.project;
    if (!project) return;
    assertCapability(get, 'project.write');

    await commitTransaction({
      set,
      get,
      scope: 'session',
      resource: 'session://default',
      saveLabel: 'session',
      operations: [
        {
          type: 'session.save',
          resourceId: 'session://default',
          summary: i18n.t('store:saveSession'),
        },
      ],
      action: () => engineApi.saveSession(session),
      updateProject: (currentProject) => ({
        ...currentProject,
        session: cloneValue(session),
      }),
    });
  },

  deleteSession: async () => {
    const project = get().resources.project;
    if (!project) return;
    assertCapability(get, 'project.write');

    await commitTransaction({
      set,
      get,
      scope: 'session',
      resource: 'session://default',
      saveLabel: 'session',
      operations: [
        {
          type: 'session.delete',
          resourceId: 'session://default',
          summary: i18n.t('store:deleteSession'),
        },
      ],
      action: () => engineApi.deleteSession(),
      updateProject: (currentProject) => ({
        ...currentProject,
        session: null,
      }),
    });
  },

  updateConfig: async (patch) => {
    const project = get().resources.project;
    if (!project) return;
    assertCapability(get, 'project.write');

    await commitTransaction({
      set,
      get,
      scope: 'project',
      resource: 'config://project',
      saveLabel: 'config',
      operations: [
        {
          type: 'config.save',
          resourceId: 'config://project',
          summary: i18n.t('store:saveConfig'),
        },
      ],
      action: () => engineApi.saveConfig(patch),
      updateProject: (currentProject) => ({
        ...currentProject,
        config: { ...currentProject.config, ...patch } as typeof currentProject.config,
      }),
    });
  },

  createRun: async (forceNew = false, mode) => {
    assertCapability(get, 'engine.execute');
    const hasBreakpoints = get().runDebug.breakpoints.length > 0;
    const resolvedMode = mode ?? 'continue';
    const { run, breakpointStepId } = await withJob({
      set,
      get,
      title: i18n.t('store:createManagedRun'),
      detail: forceNew ? i18n.t('store:createRunForceNew') : i18n.t('store:createRunReuse'),
      action: async (updateProgress) => {
        updateProgress(40, i18n.t('store:requestEngineCreateRun'));
        if (resolvedMode === 'continue' && hasBreakpoints) {
          const created = await engineApi.createRun(forceNew, 'step');
          updateProgress(55, i18n.t('store:runCreatedWithBreakpoints', { runId: created.run_id }));
          return continueRunWithBreakpoints({
            get,
            runId: created.run_id,
            seedRun: created,
            updateProgress,
            skipInitialStepComparison: true,
          });
        }

        const created = await engineApi.createRun(forceNew, mode);
        updateProgress(85, i18n.t('store:runCreated', { runId: created.run_id }));
        return { run: created };
      },
    });

    get().recordKernelEvent({
      type: 'run.created',
      message: i18n.t('store:createRun', { runId: run.run_id }),
      runId: run.run_id,
      data: { status: run.status, active: run.active },
    });
    set((state) => {
      const latestTx = state.versionControl.transactions[0];
      const currentResourceVersion = latestTx?.nextVersion;
      return {
        runDebug: {
          ...state.runDebug,
          selectedRunId: run.run_id,
          runOrder: ensureRunOrder(state.runDebug.runOrder, run.run_id),
          records: {
            ...state.runDebug.records,
            [run.run_id]: mergeRunTraceRecord(state.runDebug.records[run.run_id], run, undefined, {
              resourceVersion: currentResourceVersion,
            }),
          },
        },
      };
    });
    if (breakpointStepId) {
      recordBreakpointHit({
        set,
        get,
        runId: run.run_id,
        run,
        stepId: breakpointStepId,
      });
    }
    if (get().capabilities.grants['trace.read']) {
      await get().selectRun(run.run_id);
    }

    return run;
  },

  createSmokeRun: async (inputs = []) => {
    assertCapability(get, 'engine.execute');
    const { run } = await withJob({
      set,
      get,
      title: 'Smoke Run',
      detail: i18n.t('store:smokeRunDetail'),
      action: async (updateProgress) => {
        updateProgress(20, i18n.t('store:requestEngineSmokeRun'));
        const created = await engineApi.createSmokeRun(inputs);
        updateProgress(90, i18n.t('store:smokeRunCompleted', { runId: created.run_id }));
        return { run: created };
      },
    });

    get().recordKernelEvent({
      type: 'run.created',
      message: `Smoke run ${run.run_id}`,
      runId: run.run_id,
      data: { status: run.status, active: run.active, smoke: true },
    });
    set((state) => {
      const latestTx = state.versionControl.transactions[0];
      const currentResourceVersion = latestTx?.nextVersion;
      return {
        runDebug: {
          ...state.runDebug,
          selectedRunId: run.run_id,
          runOrder: ensureRunOrder(state.runDebug.runOrder, run.run_id),
          records: {
            ...state.runDebug.records,
            [run.run_id]: mergeRunTraceRecord(state.runDebug.records[run.run_id], run, undefined, {
              resourceVersion: currentResourceVersion,
            }),
          },
        },
      };
    });
    if (get().capabilities.grants['trace.read']) {
      await get().selectRun(run.run_id);
    }
    return run;
  },

  listRuns: async () => {
    return engineApi.listRuns();
  },

  refreshRuns: async () => {
    const runs = await engineApi.listRuns();
    set((state) => {
      const nextRecords = { ...state.runDebug.records };
      const nextOrder = [...state.runDebug.runOrder];

      for (const run of runs) {
        nextRecords[run.run_id] = mergeRunTraceRecord(
          state.runDebug.records[run.run_id],
          {
            ...state.runDebug.records[run.run_id]?.run,
            ...run,
            cursor: state.runDebug.records[run.run_id]?.run.cursor ?? {
              currentStepId: null,
              stepIndex: 0,
            },
            state_summary: state.runDebug.records[run.run_id]?.run.state_summary ?? {
              total_keys: 0,
              keys: [],
              changed: [],
              changed_values: {},
              preview: {},
            },
            recent_events: state.runDebug.records[run.run_id]?.run.recent_events ?? [],
            input_history: state.runDebug.records[run.run_id]?.run.input_history ?? [],
          },
          state.runDebug.records[run.run_id]?.state,
          { subscribed: state.runDebug.records[run.run_id]?.subscribed ?? false },
        );
        if (!nextOrder.includes(run.run_id)) {
          nextOrder.push(run.run_id);
        }
      }

      const activeRun = runs.find((run) => run.active) ?? runs[0] ?? null;

      return {
        runDebug: {
          ...state.runDebug,
          selectedRunId: state.runDebug.selectedRunId ?? activeRun?.run_id ?? null,
          runOrder: nextOrder,
          records: nextRecords,
        },
      };
    });

    const selectedRunId = get().runDebug.selectedRunId;
    if (selectedRunId && get().capabilities.grants['trace.read']) {
      await get().selectRun(selectedRunId);
    }

    return runs;
  },

  getRun: async (runId) => {
    const run = await engineApi.getRun(runId);
    set((state) => ({
      runDebug: {
        ...state.runDebug,
        runOrder: ensureRunOrder(state.runDebug.runOrder, runId),
        records: {
          ...state.runDebug.records,
          [runId]: mergeRunTraceRecord(state.runDebug.records[runId], run),
        },
      },
    }));
    return run;
  },

  getRunState: async (runId) => {
    assertCapability(get, 'trace.read');
    const stateView = await engineApi.getRunState(runId);
    set((state) => ({
      runDebug: {
        ...state.runDebug,
        runOrder: ensureRunOrder(state.runDebug.runOrder, runId),
        records: {
          ...state.runDebug.records,
          [runId]: mergeRunTraceRecord(state.runDebug.records[runId], stateView, stateView),
        },
      },
    }));
    return stateView;
  },

  selectRun: async (runId) => {
    if (!runId) {
      set((state) => ({
        runDebug: {
          ...state.runDebug,
          selectedRunId: null,
        },
      }));
      return;
    }

    assertCapability(get, 'trace.read');
    const existing = get().runDebug.records[runId];
    if (!existing?.state) {
      const record = await hydrateRunRecord(runId);
      set((state) => ({
        runDebug: {
          ...state.runDebug,
          selectedRunId: runId,
          runOrder: ensureRunOrder(state.runDebug.runOrder, runId),
          records: {
            ...state.runDebug.records,
            [runId]: {
              ...record,
              subscribed: state.runDebug.records[runId]?.subscribed ?? false,
            },
          },
        },
      }));
    } else {
      set((state) => ({
        runDebug: {
          ...state.runDebug,
          selectedRunId: runId,
          runOrder: ensureRunOrder(state.runDebug.runOrder, runId),
        },
      }));
    }

    attachRunSubscription(set, get, runId);
    set((state) => ({
      runDebug: {
        ...state.runDebug,
        records: {
          ...state.runDebug.records,
          [runId]: {
            ...state.runDebug.records[runId],
            subscribed: true,
          },
        },
      },
    }));
  },

  advanceRun: async (runId, input, mode = 'continue') => {
    assertCapability(get, 'engine.execute');
    const hasBreakpoints = get().runDebug.breakpoints.length > 0;
    const { run, breakpointStepId } = await withJob({
      set,
      get,
      title: i18n.t('store:advanceRun', { runId }),
      detail:
        mode === 'step'
          ? (input ? i18n.t('store:advanceStepWithInput') : i18n.t('store:advanceStep'))
          : (input ? i18n.t('store:advanceContinueWithInput') : i18n.t('store:advanceContinue')),
      action: async (updateProgress) => {
        updateProgress(45, i18n.t('store:callingEngineAdvance'));
        const nextRun =
          mode === 'continue' && hasBreakpoints
            ? await continueRunWithBreakpoints({
                get,
                runId,
                input,
                updateProgress,
              })
            : { run: await engineApi.advanceRun(runId, input, mode) };
        updateProgress(85, i18n.t('store:runUpdatedTo', { runId, status: nextRun.run.status }));
        return nextRun;
      },
    });

    get().recordKernelEvent({
      type: run.status === 'ended' ? 'run.ended' : 'run.updated',
      message: i18n.t('store:runStatusUpdated', { runId, status: run.status }),
      runId,
      data: { status: run.status, waitingFor: run.waiting_for?.kind ?? null },
    });
    set((state) => ({
      runDebug: {
        ...state.runDebug,
        selectedRunId: runId,
        runOrder: ensureRunOrder(state.runDebug.runOrder, runId),
        records: {
          ...state.runDebug.records,
          [runId]: mergeRunTraceRecord(state.runDebug.records[runId], run),
        },
      },
    }));
    if (breakpointStepId) {
      recordBreakpointHit({
        set,
        get,
        runId,
        run,
        stepId: breakpointStepId,
      });
    }
    if (get().capabilities.grants['trace.read']) {
      await get().selectRun(runId);
    }

    return run;
  },

  stepRun: async (runId, input) => {
    assertCapability(get, 'engine.execute');
    return get().advanceRun(runId, input, 'step');
  },

  replayRun: async (runId) => {
    assertCapability(get, 'engine.execute');
    assertCapability(get, 'trace.read');

    const sourceState = get().runDebug.records[runId]?.state ?? await get().getRunState(runId);
    const replayedRun = await withJob({
      set,
      get,
      title: i18n.t('store:replayRun', { runId }),
      detail: i18n.t('store:replayRunDetail'),
      action: async (updateProgress) => {
        updateProgress(15, i18n.t('store:readOriginalSnapshot'));
        const nextRun = await engineApi.createRun(true, 'continue');
        updateProgress(35, i18n.t('store:replayRunCreated', { runId: nextRun.run_id }));

        let currentRun = nextRun;
        const inputs = sourceState.input_history ?? [];
        for (let index = 0; index < inputs.length; index += 1) {
          const record = inputs[index]!;
          updateProgress(
            Math.min(90, 35 + Math.round(((index + 1) / Math.max(inputs.length, 1)) * 55)),
            i18n.t('store:replayInput', { index: index + 1, total: inputs.length, stepId: record.step_id }),
          );
          currentRun = await engineApi.advanceRun(currentRun.run_id, record.input, 'continue');
        }

        updateProgress(95, i18n.t('store:runReplayed', { runId: currentRun.run_id }));
        return currentRun;
      },
    });

    get().recordKernelEvent({
      type: replayedRun.status === 'ended' ? 'run.ended' : 'run.updated',
      message: i18n.t('store:runReplayedAs', { runId, newRunId: replayedRun.run_id }),
      runId: replayedRun.run_id,
      data: { replayOf: runId, status: replayedRun.status },
    });
    set((state) => ({
      runDebug: {
        ...state.runDebug,
        selectedRunId: replayedRun.run_id,
        runOrder: ensureRunOrder(state.runDebug.runOrder, replayedRun.run_id),
        records: {
          ...state.runDebug.records,
          [replayedRun.run_id]: mergeRunTraceRecord(state.runDebug.records[replayedRun.run_id], replayedRun),
        },
      },
    }));
    await get().selectRun(replayedRun.run_id);
    return replayedRun;
  },

  toggleBreakpoint: (stepId) => {
    const normalizedStepId = stepId.trim();
    if (!normalizedStepId) {
      return;
    }

    let enabled = false;
    set((state) => {
      const exists = state.runDebug.breakpoints.some((entry) => entry.step_id === normalizedStepId);
      enabled = !exists;
      return {
        runDebug: {
          ...state.runDebug,
          breakpoints: exists
            ? state.runDebug.breakpoints.filter((entry) => entry.step_id !== normalizedStepId)
            : [
                {
                  step_id: normalizedStepId,
                  created_at: Date.now(),
                  hit_count: 0,
                },
                ...state.runDebug.breakpoints,
              ].slice(0, 40),
        },
      };
    });

    get().recordKernelEvent({
      type: 'run.updated',
      message: `${enabled ? i18n.t('store:breakpointAdded', { stepId: normalizedStepId }) : i18n.t('store:breakpointRemoved', { stepId: normalizedStepId })}`,
      data: { stepId: normalizedStepId, breakpointEnabled: enabled },
    });
  },

  clearBreakpoint: (stepId) => {
    const normalizedStepId = stepId.trim();
    if (!normalizedStepId) {
      return;
    }

    set((state) => ({
      runDebug: {
        ...state.runDebug,
        breakpoints: state.runDebug.breakpoints.filter((entry) => entry.step_id !== normalizedStepId),
      },
    }));
    get().recordKernelEvent({
      type: 'run.updated',
      message: i18n.t('store:breakpointRemoved', { stepId: normalizedStepId }),
      data: { stepId: normalizedStepId, breakpointEnabled: false },
    });
  },

  cancelRun: async (runId) => {
    assertCapability(get, 'engine.execute');
    await withJob({
      set,
      get,
      title: i18n.t('store:cancelRun', { runId }),
      detail: i18n.t('store:cancelRunDetail'),
      action: async (updateProgress) => {
        updateProgress(50, i18n.t('store:sendingCancelRequest'));
        await engineApi.cancelRun(runId);
      },
    });
    runStreamSubscriptions.get(runId)?.();
    runStreamSubscriptions.delete(runId);
    get().recordKernelEvent({
      type: 'run.cancelled',
      message: i18n.t('store:runCancelled', { runId }),
      runId,
    });
    set((state) => ({
      runDebug: {
        ...state.runDebug,
        records: {
          ...state.runDebug.records,
          [runId]: state.runDebug.records[runId]
            ? {
                ...state.runDebug.records[runId],
                subscribed: false,
              }
            : state.runDebug.records[runId],
        },
      },
    }));
  },

  createReviewProposal: (input) => {
    const project = get().resources.project;
    if (!project) {
      return null;
    }

    const checkpoints = get().versionControl.checkpoints;
    const baseCheckpoint =
      (input?.baseCheckpointId
        ? checkpoints.find((checkpoint) => checkpoint.id === input.baseCheckpointId)
        : checkpoints[0]) ?? null;
    const selectedRunId = get().runDebug.selectedRunId;
    const selectedRun = selectedRunId
      ? get().runDebug.records[selectedRunId] ?? null
      : null;
    const summary = baseCheckpoint
      ? compareSnapshot(baseCheckpoint.snapshot, project)
      : compareSnapshot(
          {
            flows: {},
            session: null,
          },
          project,
        );
    const touchedResources = deriveTouchedResources(get().versionControl.transactions, baseCheckpoint);
    const proposalId = createId('proposal');
    const proposal: ReviewProposalRecord = {
      id: proposalId,
      title: input?.title?.trim() || `Proposal ${formatTimeShort()}`,
      intent: input?.intent?.trim() || i18n.t('store:proposalDefaultIntent'),
      status: 'draft',
      createdAt: Date.now(),
      origin: { kind: 'user', id: 'studio.review', label: 'Review Workspace' },
      baseCheckpointId: baseCheckpoint?.id,
      baseResourceVersion: get().versionControl.resourceVersions['project://current']?.version ?? 0,
      touchedResources,
      semanticSummary: summary,
      expectedDiagnostics: summarizeDiagnostics(get().versionControl.diagnostics),
      recommendedValidations: [
        i18n.t('store:proposalValidation.runLint'),
        i18n.t('store:proposalValidation.runSmoke'),
        i18n.t('store:proposalValidation.checkTrace'),
      ],
      riskNotes: deriveRiskNotes({
        summary,
        diagnostics: get().versionControl.diagnostics,
        selectedRun,
      }),
      relatedRunId: selectedRun?.runId,
      relatedStateKeys: selectedRun?.stateDiff.map((entry) => entry.key) ?? [],
      validation: {
        lintStatus: 'idle',
        smokeStatus: 'idle',
      },
    };

    set((state) => ({
      review: {
        activeProposalId: proposalId,
        proposals: [proposal, ...state.review.proposals].slice(0, 30),
      },
    }));
    get().recordKernelEvent({
      type: 'review.changed',
      message: i18n.t('store:createProposal', { title: proposal.title }),
      resourceId: 'project://current',
      data: { proposalId },
    });
    syncReviewWorkspaceState(get);
    return proposalId;
  },

  setActiveProposal: (proposalId) => {
    set((state) => ({
      review: {
        ...state.review,
        activeProposalId: proposalId,
      },
    }));
  },

  validateProposal: async (proposalId) => {
    const proposal = get().review.proposals.find((entry) => entry.id === proposalId);
    if (!proposal) {
      throw new Error(i18n.t('store:proposalNotFound'));
    }

    set((state) => ({
      review: {
        ...state.review,
        proposals: state.review.proposals.map((entry) =>
          entry.id === proposalId
            ? {
                ...entry,
                validation: {
                  ...entry.validation,
                  lintStatus: 'running',
                  smokeStatus: 'running',
                  error: undefined,
                },
              }
            : entry,
        ),
      },
    }));

    try {
      const smokeRun = await withJob({
        set,
        get,
        title: i18n.t('store:validateProposal', { title: proposal.title }),
        detail: i18n.t('store:validateProposalDetail'),
        action: async (updateProgress) => {
          updateProgress(30, i18n.t('store:refreshingDiagnostics'));
          await get().refreshDiagnostics();
          updateProgress(60, i18n.t('store:requestingEngineSmoke'));
          const run = await get().createSmokeRun([]);
          updateProgress(85, i18n.t('store:runCreated', { runId: run.run_id }));
          return run;
        },
      });
      const diagnostics = get().versionControl.diagnostics;

      set((state) => ({
        review: {
          ...state.review,
          proposals: state.review.proposals.map((entry) =>
            entry.id === proposalId
              ? {
                ...entry,
                  status: 'ready',
                  relatedRunId: smokeRun.run_id,
                  relatedStateKeys: smokeRun.state_summary.changed,
                  expectedDiagnostics: summarizeDiagnostics(diagnostics),
                  validation: {
                    lintStatus: 'completed',
                    smokeStatus: 'completed',
                    diagnostics,
                    smoke: null,
                    smokeRun,
                    lastValidatedAt: Date.now(),
                  },
                }
              : entry,
          ),
        },
      }));
      get().recordKernelEvent({
        type: 'review.changed',
        message: i18n.t('store:proposalValidated', { title: proposal.title }),
        data: { proposalId },
      });
      syncReviewWorkspaceState(get);
    } catch (error) {
      set((state) => ({
        review: {
          ...state.review,
          proposals: state.review.proposals.map((entry) =>
            entry.id === proposalId
              ? {
                  ...entry,
                  validation: {
                    ...entry.validation,
                    lintStatus: 'failed',
                    smokeStatus: 'failed',
                    error: (error as Error).message,
                    lastValidatedAt: Date.now(),
                  },
                }
              : entry,
          ),
        },
      }));
      syncReviewWorkspaceState(get);
      throw error;
    }
  },

  acceptProposal: async (proposalId) => {
    const proposal = get().review.proposals.find((entry) => entry.id === proposalId);
    if (!proposal) {
      throw new Error(i18n.t('store:proposalNotFoundAccept'));
    }
    assertCapability(get, 'project.write');
    assertCapability(get, 'review.accept');

    get().createCheckpoint(`accepted:${proposal.title}`, proposal.intent);
    set((state) => ({
      review: {
        ...state.review,
        proposals: state.review.proposals.map((entry) =>
          entry.id === proposalId
            ? {
                ...entry,
                status: 'accepted',
              }
            : entry,
        ),
      },
    }));
    get().recordKernelEvent({
      type: 'review.changed',
      message: i18n.t('store:proposalAccepted', { title: proposal.title }),
      data: { proposalId },
    });
    syncReviewWorkspaceState(get);
  },

  rollbackProposal: async (proposalId) => {
    const proposal = get().review.proposals.find((entry) => entry.id === proposalId);
    if (!proposal) {
      throw new Error(i18n.t('store:proposalNotFoundRollback'));
    }
    if (!proposal.baseCheckpointId) {
      throw new Error(i18n.t('store:checkpointNotFound'));
    }

    await get().restoreCheckpoint(proposal.baseCheckpointId);
    set((state) => ({
      review: {
        ...state.review,
        proposals: state.review.proposals.map((entry) =>
          entry.id === proposalId
            ? {
                ...entry,
                status: 'rolled-back',
              }
            : entry,
        ),
      },
    }));
    get().recordKernelEvent({
      type: 'review.changed',
      message: i18n.t('store:proposalRolledBack', { title: proposal.title }),
      data: { proposalId, checkpointId: proposal.baseCheckpointId },
    });
    syncReviewWorkspaceState(get);
  },

  createCommentThread: (input) => {
    assertCapability(get, 'comment.write');
    if (!input.title.trim() || !input.body.trim()) {
      return null;
    }

    const threadId = createId('thread');
    const now = Date.now();
    const thread: CommentThreadRecord = {
      id: threadId,
      title: input.title.trim(),
      anchor: input.anchor,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      comments: [
        {
          id: createId('comment'),
          author: input.author?.trim() || 'Studio User',
          body: input.body.trim(),
          createdAt: now,
        },
      ],
    };

    set((state) => ({
      comments: {
        activeThreadId: threadId,
        threads: [thread, ...state.comments.threads].slice(0, 200),
      },
    }));
    get().recordKernelEvent({
      type: 'review.changed',
      message: i18n.t('store:createCommentThread', { title: thread.title }),
      data: { threadId, anchor: input.anchor.kind },
    });
    syncCommentsWorkspaceState(get);
    return threadId;
  },

  addComment: (threadId, body, author) => {
    assertCapability(get, 'comment.write');
    if (!body.trim()) {
      return;
    }

    set((state) => ({
      comments: {
        ...state.comments,
        threads: state.comments.threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                updatedAt: Date.now(),
                comments: [
                  ...thread.comments,
                  {
                    id: createId('comment'),
                    author: author?.trim() || 'Studio User',
                    body: body.trim(),
                    createdAt: Date.now(),
                  },
                ],
              }
            : thread,
        ),
      },
    }));
    get().recordKernelEvent({
      type: 'review.changed',
      message: i18n.t('store:commentThreadReplyAdded', { threadId }),
      data: { threadId },
    });
    syncCommentsWorkspaceState(get);
  },

  resolveCommentThread: (threadId, resolved) => {
    assertCapability(get, 'comment.write');
    set((state) => ({
      comments: {
        ...state.comments,
        threads: state.comments.threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                status: resolved ? 'resolved' : 'open',
                updatedAt: Date.now(),
              }
            : thread,
        ),
      },
    }));
    get().recordKernelEvent({
      type: 'review.changed',
      message: i18n.t('store:commentThreadStatusChanged', { threadId, status: resolved ? i18n.t('store:resolved') : i18n.t('store:reopened') }),
      data: { threadId, resolved },
    });
    syncCommentsWorkspaceState(get);
  },

  setActiveCommentThread: (threadId) => {
    set((state) => ({
      comments: {
        ...state.comments,
        activeThreadId: threadId,
      },
    }));
  },

  createCheckpoint: (label, description) => {
    const project = get().resources.project;
    if (!project) {
      return null;
    }
    assertCapability(get, 'project.write');

    const checkpoint: CheckpointRecord = {
      id: createId('cp'),
      label: label?.trim() || `Checkpoint ${formatTimeShort()}`,
      description,
      createdAt: Date.now(),
      resourceIds: [
        ...Object.keys(project.flows).map((flowName) => getFlowResourceId(flowName)),
        'session://default',
      ],
      snapshot: captureRestorableSnapshot(project),
    };

    set((state) => ({
      versionControl: {
        ...state.versionControl,
        checkpoints: [checkpoint, ...state.versionControl.checkpoints].slice(0, 30),
      },
    }));

    get().recordKernelEvent({
      type: 'checkpoint.created',
      message: i18n.t('store:createCheckpoint', { label: checkpoint.label }),
      resourceId: 'project://current',
      data: { checkpointId: checkpoint.id },
    });
    get().recordKernelEvent({
      type: 'history.updated',
      message: i18n.t('store:checkpointSaved', { label: checkpoint.label }),
      resourceId: 'project://current',
    });

    return checkpoint;
  },

  restoreCheckpoint: async (checkpointId) => {
    const checkpoint = get().versionControl.checkpoints.find((entry) => entry.id === checkpointId);
    const project = get().resources.project;

    if (!checkpoint || !project) {
      throw new Error(i18n.t('store:checkpointNotFound'));
    }
    assertCapability(get, 'project.write');

    await withJob({
      set,
      get,
      title: i18n.t('store:restoreCheckpoint', { label: checkpoint.label }),
      detail: i18n.t('store:restoreCheckpointDetail'),
      action: async (updateProgress) => {
        await withSaveState(set, 'project', checkpoint.label, async () => {
          const beforeSnapshot = createSnapshotEntry(
            `restore:${checkpoint.label}`,
            project,
            get().workbench.activeFlowId,
          );
          updateProgress(25, i18n.t('store:restoringCheckpointSnapshot'));
          const { project: nextProject, currentFlow } = await restoreProjectSnapshot(
            checkpoint.snapshot,
            project,
            get().workbench.activeFlowId,
          );
          updateProgress(70, i18n.t('store:refreshingDiagnosticsAndHistory'));
          const diagnostics = await fetchDiagnosticsReport();

          set((state) => {
            const transactionId = createId('tx');
            const transaction: TransactionRecord = {
              id: transactionId,
              resourceId: 'project://current',
              baseVersion: state.versionControl.resourceVersions['project://current']?.version ?? 0,
              nextVersion: (state.versionControl.resourceVersions['project://current']?.version ?? 0) + 1,
              timestamp: Date.now(),
              origin: { kind: 'user', id: 'studio.version-control', label: 'Version Control' },
              operations: [
                {
                  type: 'checkpoint.restore',
                  resourceId: 'project://current',
                  summary: i18n.t('store:checkpointRestored', { label: checkpoint.label }),
                },
              ],
            };

            return {
              resources: {
                ...state.resources,
                project: nextProject,
              },
              workbench: {
                ...state.workbench,
                activeFlowId: currentFlow,
              },
              versionControl: {
                ...state.versionControl,
                resourceVersions: {
                  ...initializeResourceVersions(nextProject, state.versionControl.resourceVersions),
                  'project://current': {
                    resourceId: 'project://current',
                    version: transaction.nextVersion,
                    updatedAt: transaction.timestamp,
                    lastTransactionId: transaction.id,
                  },
                },
                diagnostics,
                diagnosticsUpdatedAt: diagnostics ? Date.now() : state.versionControl.diagnosticsUpdatedAt,
                transactions: [transaction, ...state.versionControl.transactions].slice(0, 100),
                undoStack: [beforeSnapshot, ...state.versionControl.undoStack].slice(0, 50),
                redoStack: [],
              },
            };
          });
        });
      },
    });

    get().recordKernelEvent({
      type: 'checkpoint.restored',
      message: i18n.t('store:checkpointRestored', { label: checkpoint.label }),
      resourceId: 'project://current',
      data: { checkpointId: checkpoint.id },
    });
    get().recordKernelEvent({
      type: 'history.updated',
      message: i18n.t('store:historyRolledBack', { label: checkpoint.label }),
      resourceId: 'project://current',
    });
  },

  refreshDiagnostics: async () => {
    const diagnostics = await withJob({
      set,
      get,
      title: i18n.t('store:refreshDiagnostics'),
      detail: i18n.t('store:refreshDiagnosticsDetail'),
      action: async (updateProgress) => {
        updateProgress(50, i18n.t('store:requestingEngineDiagnostics'));
        return fetchDiagnosticsReport();
      },
    });
    set((state) => {
      const timestamp = Date.now();
      const currentVersion = state.versionControl.resourceVersions['project://current']?.version ?? 0;
      const transactionId = createId('tx');
      const transaction: TransactionRecord = {
        id: transactionId,
        resourceId: 'project://current',
        baseVersion: currentVersion,
        nextVersion: currentVersion,
        timestamp,
        origin: { kind: 'user', id: 'studio.diagnostics', label: 'Diagnostics Refresh' },
        operations: [
          {
            type: 'diagnostics.refresh',
            resourceId: 'project://current',
            summary: i18n.t('store:refreshDiagnostics'),
          },
        ],
      };

      return {
        versionControl: {
          ...state.versionControl,
          diagnostics,
          diagnosticsUpdatedAt: timestamp,
          transactions: [transaction, ...state.versionControl.transactions].slice(0, 100),
        },
      };
    });
    get().recordKernelEvent({
      type: 'diagnostics.updated',
      message: i18n.t('store:diagnosticsRefreshedEvent'),
      resourceId: 'project://current',
    });
  },

  undo: async () => {
    const project = get().resources.project;
    const undoEntry = get().versionControl.undoStack[0];
    if (!project || !undoEntry) return;
    assertCapability(get, 'project.write');

    await withJob({
      set,
      get,
      title: i18n.t('store:undoTransaction', { label: undoEntry.label }),
      detail: i18n.t('store:undoDetail'),
      action: async (updateProgress) => {
        await withSaveState(set, 'project', undoEntry.label, async () => {
          const redoEntry = createSnapshotEntry(`redo:${undoEntry.label}`, project, get().workbench.activeFlowId);
          updateProgress(30, i18n.t('store:applyingUndoSnapshot'));
          const { project: nextProject, currentFlow } = await restoreProjectSnapshot(
            undoEntry.snapshot,
            project,
            undoEntry.activeFlowId,
          );
          updateProgress(75, i18n.t('store:refreshingDiagnosticsAndVersions'));
          const diagnostics = await fetchDiagnosticsReport();

          set((state) => {
            const transactionId = createId('tx');
            const transaction: TransactionRecord = {
              id: transactionId,
              resourceId: 'project://current',
              baseVersion: state.versionControl.resourceVersions['project://current']?.version ?? 0,
              nextVersion: (state.versionControl.resourceVersions['project://current']?.version ?? 0) + 1,
              timestamp: Date.now(),
              origin: { kind: 'user', id: 'studio.undo', label: 'Undo' },
              operations: [
                {
                  type: 'transaction.undo',
                  resourceId: 'project://current',
                  summary: i18n.t('store:undoCompleted', { label: undoEntry.label }),
                },
              ],
            };

            return {
              resources: {
                ...state.resources,
                project: nextProject,
              },
              workbench: {
                ...state.workbench,
                activeFlowId: currentFlow,
              },
              versionControl: {
                ...state.versionControl,
                resourceVersions: {
                  ...initializeResourceVersions(nextProject, state.versionControl.resourceVersions),
                  'project://current': {
                    resourceId: 'project://current',
                    version: transaction.nextVersion,
                    updatedAt: transaction.timestamp,
                    lastTransactionId: transaction.id,
                  },
                },
                diagnostics,
                diagnosticsUpdatedAt: diagnostics ? Date.now() : state.versionControl.diagnosticsUpdatedAt,
                transactions: [transaction, ...state.versionControl.transactions].slice(0, 100),
                undoStack: state.versionControl.undoStack.slice(1),
                redoStack: [redoEntry, ...state.versionControl.redoStack].slice(0, 50),
              },
            };
          });
        });
      },
    });
    get().recordKernelEvent({
      type: 'history.updated',
      message: i18n.t('store:undoCompleted', { label: undoEntry.label }),
      resourceId: 'project://current',
    });
  },

  redo: async () => {
    const project = get().resources.project;
    const redoEntry = get().versionControl.redoStack[0];
    if (!project || !redoEntry) return;
    assertCapability(get, 'project.write');

    await withJob({
      set,
      get,
      title: i18n.t('store:redoTransaction', { label: redoEntry.label }),
      detail: i18n.t('store:redoDetail'),
      action: async (updateProgress) => {
        await withSaveState(set, 'project', redoEntry.label, async () => {
          const undoEntry = createSnapshotEntry(`undo:${redoEntry.label}`, project, get().workbench.activeFlowId);
          updateProgress(30, i18n.t('store:applyingRedoSnapshot'));
          const { project: nextProject, currentFlow } = await restoreProjectSnapshot(
            redoEntry.snapshot,
            project,
            redoEntry.activeFlowId,
          );
          updateProgress(75, i18n.t('store:refreshingDiagnosticsAndVersions'));
          const diagnostics = await fetchDiagnosticsReport();

          set((state) => {
            const transactionId = createId('tx');
            const transaction: TransactionRecord = {
              id: transactionId,
              resourceId: 'project://current',
              baseVersion: state.versionControl.resourceVersions['project://current']?.version ?? 0,
              nextVersion: (state.versionControl.resourceVersions['project://current']?.version ?? 0) + 1,
              timestamp: Date.now(),
              origin: { kind: 'user', id: 'studio.redo', label: 'Redo' },
              operations: [
                {
                  type: 'transaction.redo',
                  resourceId: 'project://current',
                  summary: i18n.t('store:redoCompleted', { label: redoEntry.label }),
                },
              ],
            };

            return {
              resources: {
                ...state.resources,
                project: nextProject,
              },
              workbench: {
                ...state.workbench,
                activeFlowId: currentFlow,
              },
              versionControl: {
                ...state.versionControl,
                resourceVersions: {
                  ...initializeResourceVersions(nextProject, state.versionControl.resourceVersions),
                  'project://current': {
                    resourceId: 'project://current',
                    version: transaction.nextVersion,
                    updatedAt: transaction.timestamp,
                    lastTransactionId: transaction.id,
                  },
                },
                diagnostics,
                diagnosticsUpdatedAt: diagnostics ? Date.now() : state.versionControl.diagnosticsUpdatedAt,
                transactions: [transaction, ...state.versionControl.transactions].slice(0, 100),
                undoStack: [undoEntry, ...state.versionControl.undoStack].slice(0, 50),
                redoStack: state.versionControl.redoStack.slice(1),
              },
            };
          });
        });
      },
    });
    get().recordKernelEvent({
      type: 'history.updated',
      message: i18n.t('store:redoCompleted', { label: redoEntry.label }),
      resourceId: 'project://current',
    });
  },

  setCapabilityGrant: (capability, granted) => {
    set((state) => {
      const grants = {
        ...state.capabilities.grants,
        [capability]: granted,
      };

      return {
        capabilities: {
          grants,
        },
        extensions: {
          records: createExtensionRuntimeRecords(grants, state.extensions.records),
        },
      };
    });
    get().recordKernelEvent({
      type: 'capability.updated',
      message: i18n.t('store:capabilityChanged', { capability, status: granted ? 'granted' : 'revoked' }),
      data: { capability, granted },
    });
  },

  resetCapabilityGrants: () => {
    set((state) => ({
      capabilities: {
        grants: DEFAULT_CAPABILITY_GRANTS,
      },
      extensions: {
        records: createExtensionRuntimeRecords(DEFAULT_CAPABILITY_GRANTS, state.extensions.records),
      },
    }));
    get().recordKernelEvent({
      type: 'capability.updated',
      message: i18n.t('store:capabilityGrantsReset'),
    });
  },

  setExtensionEnabled: (extensionId, enabled) => {
    set((state) => {
      const current = state.extensions.records[extensionId];
      if (!current) {
        return state;
      }

      const nextRecords = {
        ...state.extensions.records,
        [extensionId]: {
          ...current,
          enabled,
          status: resolveExtensionRuntimeStatus({
            enabled,
            activated: current.activated,
            error: current.error,
            missingCapabilities: current.missingCapabilities,
          }),
        },
      };

      return {
        extensions: {
          records: nextRecords,
        },
      };
    });
  },

  activateExtension: (extensionId, reason) => {
    set((state) => {
      const current = state.extensions.records[extensionId];
      if (!current) {
        return state;
      }

      return {
        extensions: {
          records: {
            ...state.extensions.records,
            [extensionId]: {
              ...current,
              activated: true,
              activationReason: reason,
              lastActivatedAt: Date.now(),
              status: resolveExtensionRuntimeStatus({
                enabled: current.enabled,
                activated: true,
                error: current.error,
                missingCapabilities: current.missingCapabilities,
              }),
            },
          },
        },
      };
    });
    get().recordKernelEvent({
      type: 'extension.activated',
      message: i18n.t('store:extensionActivated', { extensionId, reason }),
      extensionId,
      data: { reason },
    });
  },

  clearExtensionError: (extensionId) => {
    set((state) => {
      const current = state.extensions.records[extensionId];
      if (!current) {
        return state;
      }

      return {
        extensions: {
          records: {
            ...state.extensions.records,
            [extensionId]: {
              ...current,
              error: undefined,
              status: resolveExtensionRuntimeStatus({
                enabled: current.enabled,
                activated: current.activated,
                missingCapabilities: current.missingCapabilities,
              }),
            },
          },
        },
      };
    });
  },

  markExtensionError: (extensionId, message) => {
    set((state) => {
      const current = state.extensions.records[extensionId];
      if (!current) {
        return state;
      }

      return {
        extensions: {
          records: {
            ...state.extensions.records,
            [extensionId]: {
              ...current,
              error: message,
              status: resolveExtensionRuntimeStatus({
                enabled: current.enabled,
                activated: current.activated,
                error: message,
                missingCapabilities: current.missingCapabilities,
              }),
            },
          },
        },
      };
    });
    get().recordKernelEvent({
      type: 'extension.error',
      message: i18n.t('store:extensionError', { extensionId, message }),
      extensionId,
    });
  },

  recordKernelEvent: (event) => {
    set((state) => appendKernelEvent(state, event));
  },

  refreshGitStatus: async () => {
    try {
      const [status, log] = await Promise.all([
        engineApi.getGitStatus(),
        engineApi.getGitLog(20),
      ]);
      set({
        git: {
          status,
          log,
          updatedAt: Date.now(),
        },
      });
    } catch (error) {
      // Git not available or error occurred, keep current state
      console.warn('Failed to refresh git status:', error);
    }
  },

  loadPackages: async () => {
    set((state) => ({ packages: { ...state.packages, loading: true } }));
    try {
      const installed = await engineApi.listPackages();
      set({ packages: { installed, loading: false, updatedAt: Date.now() } });
    } catch (error) {
      console.warn('Failed to load packages:', error);
      set((state) => ({ packages: { ...state.packages, loading: false } }));
    }
  },

  refreshReferences: async (resourceId?: string) => {
    set((state) => ({ referenceGraph: { ...state.referenceGraph, loading: true } }));
    try {
      const entries = await engineApi.getReferences(resourceId);
      set({ referenceGraph: { entries, searchResults: null, searchQuery: '', loading: false, updatedAt: Date.now() } });
    } catch (error) {
      console.warn('Failed to refresh references:', error);
      set((state) => ({ referenceGraph: { ...state.referenceGraph, loading: false } }));
    }
  },

  searchProject: async (query: string) => {
    set((state) => ({ referenceGraph: { ...state.referenceGraph, loading: true, searchQuery: query } }));
    try {
      const searchResults = await engineApi.search(query);
      set((state) => ({ referenceGraph: { ...state.referenceGraph, searchResults, loading: false, updatedAt: Date.now() } }));
    } catch (error) {
      console.warn('Failed to search project:', error);
      set((state) => ({ referenceGraph: { ...state.referenceGraph, loading: false } }));
    }
  },

  applyTemplate: async (templateId: string, packageId: string) => {
    const packages = get().packages.installed;
    const pkg = packages.find((entry) => entry.manifest.id === packageId);
    const template = pkg?.manifest.contributes?.templates?.find((entry) => entry.id === templateId);
    const bundle = await engineApi.applyTemplate(packageId, templateId);

    await get().reloadProject();

    get().recordKernelEvent({
      type: 'resource.changed',
      message: `Template "${template?.name ?? templateId}" applied from ${pkg?.manifest.name ?? packageId}`,
      resourceId: `template://${templateId}`,
      data: {
        packageId,
        flowIds: bundle.summary.flowIds,
        hasSession: bundle.summary.hasSession,
        stateKeys: bundle.summary.stateKeys,
      },
    });
  },
}));

useStudioStore.subscribe((state) => {
  persistWorkbenchState(state.workbench);
  persistExtensionPreferences(state.extensions.records);
  persistBreakpoints(state.runDebug.breakpoints);
});

// Wire capability grants into engine API request headers
setCapabilityProvider(() => {
  const grants = useStudioStore.getState().capabilities.grants;
  return Object.entries(grants)
    .filter(([, granted]) => granted)
    .map(([cap]) => cap);
});

let checkingEngineReachability = false;

setConnectionLostHandler((message) => {
  const state = useStudioStore.getState();
  if (!state.connection.engineConnected || !state.resources.project || checkingEngineReachability) {
    return;
  }

  checkingEngineReachability = true;
  void engineApi.getProject()
    .catch(() => {
      const latest = useStudioStore.getState();
      if (!latest.connection.engineConnected || !latest.resources.project) {
        return;
      }
      latest.disconnect();
      useStudioStore.setState((current) => ({
        connection: {
          ...current.connection,
          connectionError: message,
        },
      }));
    })
    .finally(() => {
      checkingEngineReachability = false;
    });
});
