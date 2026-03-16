import { create } from 'zustand';
import { engineApi } from '@/api/engine-client';
import {
  DEFAULT_STUDIO_VIEW_ID,
  OFFICIAL_STUDIO_EXTENSIONS,
  getStudioExtensionForView,
} from '@/kernel/registry';
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
} from '@/kernel/types';
import type {
  CheckpointRecord,
  DiagnosticsPayload,
  FlowDefinition,
  ProjectData,
  ResourceId,
  ResourceVersionState,
  RestorableSnapshot,
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
  executeFlow: (flowId: string, input?: Record<string, any>) => Promise<any>;
  reloadProject: () => Promise<void>;
  saveSession: (session: SessionDefinition) => Promise<void>;
  deleteSession: () => Promise<void>;
  createRun: (forceNew?: boolean) => Promise<RunView>;
  listRuns: () => Promise<RunSummary[]>;
  refreshRuns: () => Promise<RunSummary[]>;
  getRun: (runId: string) => Promise<RunView>;
  getRunState: (runId: string) => Promise<RunStateView>;
  selectRun: (runId: string | null) => Promise<void>;
  advanceRun: (runId: string, input?: string) => Promise<RunView>;
  cancelRun: (runId: string) => Promise<void>;
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
const runStreamSubscriptions = new Map<string, () => void>();

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
        parsed.activePreset === 'debug' ||
        parsed.activePreset === 'review' ||
        parsed.activePreset === 'history' ||
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

  const { commandPaletteOpen: _commandPaletteOpen, ...persistedWorkbench } = workbench;
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

function persistExtensionPreferences(records: Record<StudioExtensionId, StudioExtensionRuntimeRecord>) {
  if (typeof window === 'undefined') {
    return;
  }

  const persisted = Object.fromEntries(
    Object.values(records).map((record) => [record.extensionId, { enabled: record.enabled }]),
  );
  window.localStorage.setItem(EXTENSION_RUNTIME_STORAGE_KEY, JSON.stringify(persisted));
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getFlowResourceId(flowName: string): ResourceId {
  return `flow://${flowName}`;
}

function captureRestorableSnapshot(project: ProjectData | null): {
  flows: Record<string, FlowDefinition>;
  session: SessionDefinition | null;
} {
  return {
    flows: cloneValue(project?.flows ?? {}),
    session: project?.session ? cloneValue(project.session) : null,
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
  'engine.debug': false,
  'trace.read': true,
  'network.fetch': false,
  'process.exec': false,
  'package.install': false,
  'package.publish': false,
  'comment.write': false,
  'review.accept': false,
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
      title: `${event.step_id} 输出`,
      detail: event.normalized.narration ?? event.flow_id ?? 'run output',
      changedKeys: Object.keys(event.normalized.state_changes ?? {}),
    };
  }

  return {
    title: 'Run 结束',
    detail: event.message ?? 'Session ended',
    changedKeys: [],
  };
}

function buildTraceTimeline(run: RunView, state?: RunStateView): TraceTimelineEntry[] {
  const recentEvents = run.recent_events ?? [];
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

  return [...eventEntries, snapshotEntry].sort((left, right) => right.timestamp - left.timestamp);
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
  options?: { subscribed?: boolean },
): RunTraceRecord {
  const nextState = state ?? existing?.state;
  return {
    runId: run.run_id,
    run,
    state: nextState,
    timeline: buildTraceTimeline(run, nextState),
    stateDiff: nextState ? buildStateDiff(nextState) : existing?.stateDiff ?? [],
    updatedAt: Date.now(),
    subscribed: options?.subscribed ?? existing?.subscribed ?? false,
  };
}

function ensureRunOrder(runOrder: string[], runId: string): string[] {
  return [runId, ...runOrder.filter((candidate) => candidate !== runId)];
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
      message: `事务已写入: ${operationSummary}`,
      resourceId: resource,
    });
    get().recordKernelEvent({
      type: 'diagnostics.updated',
      message: '资源变更后 diagnostics 已刷新',
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
          message: `${title} 已开始`,
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
              message: `${title} 进度 ${progress}%`,
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
              message: `${title} 已完成`,
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
              message: `${title} 失败: ${(error as Error).message}`,
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
      message: `Run ${runId} 收到 ${event.type}`,
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
        title: '连接 Engine',
        detail: '拉取 project snapshot 与 diagnostics',
        action: async (updateProgress) => {
          updateProgress(25, '拉取 canonical project snapshot');
          const projectTask = loadProjectSnapshot(get().workbench.activeFlowId);
          const diagnosticsTask = fetchDiagnosticsReport();
          const [{ project, currentFlow }, diagnostics] = await Promise.all([projectTask, diagnosticsTask]);
          updateProgress(85, '同步 workbench 与 extension runtime');

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
        message: 'Studio 已连接到 Engine',
        resourceId: 'project://current',
      });
      get().recordKernelEvent({
        type: 'diagnostics.updated',
        message: '初始 diagnostics 已同步',
        resourceId: 'project://current',
      });
      if (get().capabilities.grants['trace.read']) {
        await get().refreshRuns().catch(() => {
          // Keep workbench usable even if run catalog hydration fails.
        });
      }
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
      },
    }));
    get().recordKernelEvent({
      type: 'project.disconnected',
      message: 'Studio 已断开与 Engine 的连接',
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
    set((state) => ({
      workbench: {
        ...state.workbench,
        activePreset: preset,
      },
    }));
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
          summary: `保存 Flow ${flowName}`,
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
          summary: `创建 Flow ${flowName}`,
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
      title: '重载项目',
      detail: '调用 Engine 重新加载项目资源',
      action: async (updateProgress) => {
        updateProgress(20, '请求 Engine reload');
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
              summary: '重载项目快照',
            },
          ],
          action: async () => {
            await engineApi.reloadProject();
            updateProgress(60, '重新拉取 canonical snapshot');
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
      message: '项目快照已从 Engine 重新加载',
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
          summary: '保存 Session',
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
          summary: '删除 Session',
        },
      ],
      action: () => engineApi.deleteSession(),
      updateProject: (currentProject) => ({
        ...currentProject,
        session: null,
      }),
    });
  },

  createRun: async (forceNew = false) => {
    assertCapability(get, 'engine.execute');
    const run = await withJob({
      set,
      get,
      title: '创建 Managed Run',
      detail: forceNew ? '强制创建新的 run' : '创建或复用当前 run',
      action: async (updateProgress) => {
        updateProgress(40, '请求 Engine 创建 run');
        const created = await engineApi.createRun(forceNew);
        updateProgress(85, `Run ${created.run_id} 已创建`);
        return created;
      },
    });

    get().recordKernelEvent({
      type: 'run.created',
      message: `创建 run ${run.run_id}`,
      runId: run.run_id,
      data: { status: run.status, active: run.active },
    });
    set((state) => ({
      runDebug: {
        ...state.runDebug,
        selectedRunId: run.run_id,
        runOrder: ensureRunOrder(state.runDebug.runOrder, run.run_id),
        records: {
          ...state.runDebug.records,
          [run.run_id]: mergeRunTraceRecord(state.runDebug.records[run.run_id], run),
        },
      },
    }));
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

  advanceRun: async (runId, input) => {
    assertCapability(get, 'engine.execute');
    const run = await withJob({
      set,
      get,
      title: `推进 Run ${runId}`,
      detail: input ? '发送输入并推进 run' : '推进 run 到下一个状态',
      action: async (updateProgress) => {
        updateProgress(45, '调用 Engine advance');
        const nextRun = await engineApi.advanceRun(runId, input);
        updateProgress(85, `Run ${runId} 已更新为 ${nextRun.status}`);
        return nextRun;
      },
    });

    get().recordKernelEvent({
      type: run.status === 'ended' ? 'run.ended' : 'run.updated',
      message: `Run ${runId} 状态更新为 ${run.status}`,
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
    if (get().capabilities.grants['trace.read']) {
      await get().selectRun(runId);
    }

    return run;
  },

  cancelRun: async (runId) => {
    assertCapability(get, 'engine.execute');
    await withJob({
      set,
      get,
      title: `取消 Run ${runId}`,
      detail: '请求 Engine 取消 managed run',
      action: async (updateProgress) => {
        updateProgress(50, '发送 cancel 请求');
        await engineApi.cancelRun(runId);
      },
    });
    runStreamSubscriptions.get(runId)?.();
    runStreamSubscriptions.delete(runId);
    get().recordKernelEvent({
      type: 'run.cancelled',
      message: `Run ${runId} 已取消`,
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

  createCheckpoint: (label, description) => {
    const project = get().resources.project;
    if (!project) {
      return null;
    }
    assertCapability(get, 'project.write');

    const checkpoint: CheckpointRecord = {
      id: createId('cp'),
      label: label?.trim() || `Checkpoint ${new Date().toLocaleTimeString('zh-CN')}`,
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
      message: `创建 checkpoint: ${checkpoint.label}`,
      resourceId: 'project://current',
      data: { checkpointId: checkpoint.id },
    });
    get().recordKernelEvent({
      type: 'history.updated',
      message: `checkpoint ${checkpoint.label} 已写入历史`,
      resourceId: 'project://current',
    });

    return checkpoint;
  },

  restoreCheckpoint: async (checkpointId) => {
    const checkpoint = get().versionControl.checkpoints.find((entry) => entry.id === checkpointId);
    const project = get().resources.project;

    if (!checkpoint || !project) {
      throw new Error('找不到可恢复的 checkpoint');
    }
    assertCapability(get, 'project.write');

    await withJob({
      set,
      get,
      title: `恢复 Checkpoint ${checkpoint.label}`,
      detail: '回滚 flows 与 session 到指定检查点',
      action: async (updateProgress) => {
        await withSaveState(set, 'project', checkpoint.label, async () => {
          const beforeSnapshot = createSnapshotEntry(
            `restore:${checkpoint.label}`,
            project,
            get().workbench.activeFlowId,
          );
          updateProgress(25, '恢复 checkpoint 对应的 project snapshot');
          const { project: nextProject, currentFlow } = await restoreProjectSnapshot(
            checkpoint.snapshot,
            project,
            get().workbench.activeFlowId,
          );
          updateProgress(70, '刷新 diagnostics 与事务历史');
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
                  summary: `恢复 checkpoint ${checkpoint.label}`,
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
      message: `已恢复 checkpoint ${checkpoint.label}`,
      resourceId: 'project://current',
      data: { checkpointId: checkpoint.id },
    });
    get().recordKernelEvent({
      type: 'history.updated',
      message: `历史已回滚到 checkpoint ${checkpoint.label}`,
      resourceId: 'project://current',
    });
  },

  refreshDiagnostics: async () => {
    const diagnostics = await withJob({
      set,
      get,
      title: '刷新 Diagnostics',
      detail: '重新拉取 Engine diagnostics',
      action: async (updateProgress) => {
        updateProgress(50, '请求 Engine diagnostics');
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
            summary: '刷新 diagnostics',
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
      message: 'Diagnostics 已手动刷新',
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
      title: `撤销 ${undoEntry.label}`,
      detail: '恢复到上一份 project snapshot',
      action: async (updateProgress) => {
        await withSaveState(set, 'project', undoEntry.label, async () => {
          const redoEntry = createSnapshotEntry(`redo:${undoEntry.label}`, project, get().workbench.activeFlowId);
          updateProgress(30, '应用撤销快照');
          const { project: nextProject, currentFlow } = await restoreProjectSnapshot(
            undoEntry.snapshot,
            project,
            undoEntry.activeFlowId,
          );
          updateProgress(75, '刷新 diagnostics 与版本状态');
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
                  summary: `撤销 ${undoEntry.label}`,
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
      message: `已撤销到 ${undoEntry.label}`,
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
      title: `重做 ${redoEntry.label}`,
      detail: '重新应用最近一次撤销的 snapshot',
      action: async (updateProgress) => {
        await withSaveState(set, 'project', redoEntry.label, async () => {
          const undoEntry = createSnapshotEntry(`undo:${redoEntry.label}`, project, get().workbench.activeFlowId);
          updateProgress(30, '应用重做快照');
          const { project: nextProject, currentFlow } = await restoreProjectSnapshot(
            redoEntry.snapshot,
            project,
            redoEntry.activeFlowId,
          );
          updateProgress(75, '刷新 diagnostics 与版本状态');
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
                  summary: `重做 ${redoEntry.label}`,
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
      message: `已重做到 ${redoEntry.label}`,
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
      message: `${capability} 已${granted ? '授权' : '撤销'}`,
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
      message: 'Capability grants 已重置为默认值',
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
      message: `扩展 ${extensionId} 已激活 (${reason})`,
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
      message: `扩展 ${extensionId} 发生错误: ${message}`,
      extensionId,
    });
  },

  recordKernelEvent: (event) => {
    set((state) => appendKernelEvent(state, event));
  },
}));

useStudioStore.subscribe((state) => {
  persistWorkbenchState(state.workbench);
  persistExtensionPreferences(state.extensions.records);
});
