/**
 * Kernel Service API — React Hooks
 *
 * 所有 React 组件和扩展应通过这些 hooks 消费 Kernel 数据和命令。
 * 每个 hook 的返回类型与 `services/types.ts` 中的 service interface 对齐。
 *
 * @see {@link ./services/types.ts} for service interface definitions
 */

import { useStudioStore } from '@/store/studioStore';
import {
  getAllExtensions,
  getAllViews,
  getStudioDebugViews,
  getStudioExtensionForView,
  getStudioInspectors,
  getStudioPanels,
  getStudioView,
} from './registry';
import { runService } from './services/run-service';
import type { PromptPreviewEntry, ResourceId, ResourceVersionState } from '@/types/project';
import type {
  StudioContextValue,
  StudioDebugViewDescriptor,
  StudioExtensionId,
  StudioExtensionRuntimeRecord,
  StudioInspectorDescriptor,
  StudioJobRecord,
  StudioKernelEventRecord,
  StudioPanelDescriptor,
} from './types';
import type {
  WorkbenchServiceState,
  ResourceServiceState,
  FlowResourceState,
  PromptPreviewState,
  ConnectionServiceState,
  SaveServiceState,
  VersionControlServiceState,
  GitServiceState,
  PresenceServiceState,
  DiagnosticsServiceState,
  ReferenceGraphServiceState,
  RunDebugServiceState,
  WorkbenchContextState,
  StudioCommandService,
  RunService,
  ResolvedPanelContribution,
  ResolvedInspectorContribution,
  ResolvedDebugViewContribution,
} from './services/types';

export function useWorkbench(): WorkbenchServiceState {
  const activeViewId = useStudioStore((state) => state.workbench.activeViewId);
  const openViewIds = useStudioStore((state) => state.workbench.openViewIds);
  const activeFlowId = useStudioStore((state) => state.workbench.activeFlowId);
  const commandPaletteOpen = useStudioStore((state) => state.workbench.commandPaletteOpen);
  const extensionRuntime = useStudioStore((state) => state.extensions.records);
  const allViews = getAllViews();
  const allExtensions = getAllExtensions();
  const activeView = getStudioView(activeViewId);
  const activeExtension = getStudioExtensionForView(activeViewId);
  const activeExtensionRuntime = activeExtension ? extensionRuntime[activeExtension.id] ?? null : null;
  const openViews = openViewIds
    .map((viewId) => allViews.find((view) => view.id === viewId) ?? null)
    .filter((view): view is NonNullable<typeof view> => Boolean(view));
  const resolvedOpenViews = openViews.length > 0 ? openViews : [activeView];

  return {
    activeViewId,
    openViewIds,
    openViews: resolvedOpenViews,
    activeFlowId,
    commandPaletteOpen,
    activeView,
    activeExtension,
    activeExtensionRuntime,
    views: allViews,
    extensions: allExtensions,
  };
}

export function useStudioResources(): ResourceServiceState {
  const project = useStudioStore((state) => state.resources.project);

  return {
    project,
    config: project?.config ?? null,
    state: project?.state ?? {},
    session: project?.session ?? null,
    nodeManifests: project?.nodeManifests ?? [],
  };
}

export function useFlowResource(flowId?: string | null): FlowResourceState {
  const project = useStudioStore((state) => state.resources.project);
  const activeFlowId = useStudioStore((state) => state.workbench.activeFlowId);
  const effectiveFlowId = flowId ?? activeFlowId;

  return {
    flowId: effectiveFlowId,
    flow: effectiveFlowId ? project?.flows[effectiveFlowId] ?? null : null,
    flowNames: Object.keys(project?.flows ?? {}).sort(),
  };
}

function pushPromptBinding(
  bindings: PromptPreviewEntry['bindings'],
  key: string,
  value: string,
) {
  if (!value.trim()) {
    return;
  }

  bindings.push({ key, value });
}

function collectPromptBindings(
  value: unknown,
  prefix = '',
  bindings: PromptPreviewEntry['bindings'] = [],
): PromptPreviewEntry['bindings'] {
  if (typeof value === 'string') {
    if (/(prompt|template|message|instruction|system|user)/i.test(prefix)) {
      pushPromptBinding(bindings, prefix, value);
    }
    return bindings;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectPromptBindings(entry, prefix ? `${prefix}[${index}]` : `[${index}]`, bindings);
    });
    return bindings;
  }

  if (!value || typeof value !== 'object') {
    return bindings;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    collectPromptBindings(child, nextPrefix, bindings);
  });

  return bindings;
}

export function usePromptPreview(): PromptPreviewState {
  const { project, session } = useStudioResources();

  const entries: PromptPreviewEntry[] = [];

  if (session) {
    session.steps.forEach((step) => {
      if (
        step.type === 'Prompt' ||
        step.type === 'Choice' ||
        step.type === 'DynamicChoice'
      ) {
        const bindings: PromptPreviewEntry['bindings'] = [];
        if ('flowRef' in step && step.flowRef) {
          pushPromptBinding(bindings, 'flowRef', step.flowRef);
        }
        if ('inputChannel' in step && step.inputChannel) {
          pushPromptBinding(bindings, 'inputChannel', step.inputChannel);
        }
        if ('stateKey' in step && step.stateKey) {
          pushPromptBinding(bindings, 'stateKey', step.stateKey);
        }

        entries.push({
          id: `session:${step.id}`,
          source: 'session-step',
          resourceId: 'session://default',
          title: step.id,
          subtitle: `${step.type} step`,
          promptText: step.promptText || '',
          bindings,
        });
      }
    });
  }

  Object.entries(project?.flows ?? {}).forEach(([flowName, flow]) => {
    flow.data.nodes.forEach((node) => {
      const bindings = collectPromptBindings(node.config ?? {});
      if (bindings.length === 0) {
        return;
      }

      const promptText = bindings
        .slice(0, 3)
        .map((binding) => `${binding.key}: ${binding.value}`)
        .join('\n');

      entries.push({
        id: `flow:${flowName}:${node.id}`,
        source: 'flow-node',
        resourceId: `flow://${flowName}`,
        title: node.label || node.id,
        subtitle: `${flowName} / ${node.type}`,
        promptText,
        bindings,
      });
    });
  });

  return {
    entries,
    total: entries.length,
  };
}

export function useConnectionState(): ConnectionServiceState {
  return useStudioStore((state) => state.connection);
}

export function useSaveState(): SaveServiceState {
  return useStudioStore((state) => state.saveState);
}

export function useVersionControl(): VersionControlServiceState {
  return useStudioStore((state) => state.versionControl);
}

export function useGitStatus(): GitServiceState {
  return useStudioStore((state) => state.git);
}

export function useReferences(_resourceId?: string): ReferenceGraphServiceState {
  return useStudioStore((state) => state.referenceGraph);
}

export function useSearch(): ReferenceGraphServiceState {
  return useStudioStore((state) => state.referenceGraph);
}

export function usePresence(): PresenceServiceState {
  return useStudioStore((state) => state.presence);
}

export function useExtensionRuntime(extensionId?: StudioExtensionId | null) {
  return useStudioStore((state) =>
    extensionId ? state.extensions.records[extensionId] ?? null : state.extensions.records,
  );
}

export function useExtensionRuntimeMap() {
  return useStudioStore((state) => state.extensions.records);
}

export function useKernelEvents(limit = 50): StudioKernelEventRecord[] {
  return useStudioStore((state) => state.kernel.events.slice(0, limit));
}

export function useKernelJobs(): StudioJobRecord[] {
  return useStudioStore((state) => state.kernel.jobs);
}

export function useDiagnostics(): DiagnosticsServiceState {
  const diagnostics = useStudioStore((state) => state.versionControl.diagnostics);
  const updatedAt = useStudioStore((state) => state.versionControl.diagnosticsUpdatedAt);

  return {
    diagnostics,
    updatedAt,
  };
}

export function useRunDebug(): RunDebugServiceState {
  const selectedRunId = useStudioStore((state) => state.runDebug.selectedRunId);
  const runOrder = useStudioStore((state) => state.runDebug.runOrder);
  const records = useStudioStore((state) => state.runDebug.records);
  const breakpoints = useStudioStore((state) => state.runDebug.breakpoints);
  const runCommandLoading = useStudioStore((state) => state.runDebug.runCommandLoading);
  const runCommandError = useStudioStore((state) => state.runDebug.runCommandError);
  const flowExecutionTrace = useStudioStore((state) => state.runDebug.flowExecutionTrace);
  const pinnedNodeData = useStudioStore((state) => state.runDebug.pinnedNodeData);
  const selectedRecord = selectedRunId ? records[selectedRunId] ?? null : null;
  const runs = runOrder
    .map((runId) => records[runId] ?? null)
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
  const selectedStepId = selectedRecord?.run.waiting_for?.step_id ?? selectedRecord?.run.cursor.currentStepId ?? null;
  const selectedWaitingStepId = selectedRecord?.run.waiting_for?.step_id ?? null;

  return {
    selectedRunId,
    selectedRecord,
    selectedRun: selectedRecord?.run ?? null,
    selectedRunState: selectedRecord?.state ?? null,
    selectedInputHistory:
      (selectedRecord?.run.input_history?.length
        ? selectedRecord.run.input_history
        : selectedRecord?.state?.input_history)
      ?? [],
    selectedTimeline: selectedRecord?.timeline ?? [],
    selectedStateDiff: selectedRecord?.stateDiff ?? [],
    selectedStepId,
    selectedWaitingStepId,
    breakpoints,
    hasBreakpointAtStep: (stepId?: string | null) => Boolean(stepId) && breakpoints.some((entry) => entry.step_id === stepId),
    runs,
    records,
    runCommandLoading,
    runCommandError,
    flowExecutionTrace,
    pinnedNodeData,
  };
}

export function useResourceVersion(resourceId?: ResourceId | null): ResourceVersionState | null {
  return useStudioStore((state) =>
    resourceId ? state.versionControl.resourceVersions[resourceId] ?? null : null,
  );
}

function resolveContributions<T extends StudioPanelDescriptor | StudioInspectorDescriptor | StudioDebugViewDescriptor>(
  contributions: T[],
  runtime: Record<string, StudioExtensionRuntimeRecord>,
) {
  return contributions
    .map((contribution) => ({
      contribution,
      runtime: runtime[contribution.extensionId] ?? null,
    }));
}

export function usePanelContributions(): ResolvedPanelContribution[] {
  const runtime = useStudioStore((state) => state.extensions.records);
  return resolveContributions(getStudioPanels(), runtime);
}

export function useInspectorContributions(): ResolvedInspectorContribution[] {
  const runtime = useStudioStore((state) => state.extensions.records);
  return resolveContributions(getStudioInspectors(), runtime);
}

export function useDebugViewContributions(): ResolvedDebugViewContribution[] {
  const runtime = useStudioStore((state) => state.extensions.records);
  return resolveContributions(getStudioDebugViews(), runtime);
}

export function useWorkbenchContext(): WorkbenchContextState {
  const { project, session } = useStudioResources();
  const { engineConnected, connectionError } = useConnectionState();
  const saveState = useSaveState();
  const versionControl = useVersionControl();
  const panelContributions = usePanelContributions();
  const selectedRunId = useStudioStore((state) => state.runDebug.selectedRunId);
  const selectedRunRecord = useStudioStore((state) =>
    state.runDebug.selectedRunId ? state.runDebug.records[state.runDebug.selectedRunId] ?? null : null,
  );
  const breakpoints = useStudioStore((state) => state.runDebug.breakpoints);
  const { activeExtension, activeExtensionRuntime, activeFlowId, activeViewId } = useWorkbench();
  const selectedStepId = selectedRunRecord?.run.waiting_for?.step_id ?? selectedRunRecord?.run.cursor.currentStepId ?? null;

  const values: Record<string, StudioContextValue> = {
    'project.loaded': Boolean(project),
    'engine.connected': engineConnected,
    'engine.connectionError': connectionError,
    'flow.active': activeFlowId,
    'session.available': Boolean(session),
    'save.status': saveState.status,
    'workbench.view': activeViewId,
    'workbench.hasBottomPanels': panelContributions.length > 0,
    'extension.active': activeExtension?.id ?? null,
    'extension.status': activeExtensionRuntime?.status ?? null,
    'capability.project.write': true,
    'capability.engine.execute': true,
    'capability.trace.read': true,
    'diagnostics.available': Boolean(versionControl.diagnostics),
    'history.undoAvailable': versionControl.undoStack.length > 0,
    'history.redoAvailable': versionControl.redoStack.length > 0,
    'run.selected': Boolean(selectedRunId),
    'run.status': selectedRunRecord?.run.status ?? null,
    'run.waitingForInput': Boolean(selectedRunRecord?.run.waiting_for),
    'run.stepId': selectedStepId,
    'run.stepHasBreakpoint': Boolean(selectedStepId && breakpoints.some((entry) => entry.step_id === selectedStepId)),
  };

  return { values };
}

export function useStudioCommands(): StudioCommandService {
  const connect = useStudioStore((state) => state.connect);
  const disconnect = useStudioStore((state) => state.disconnect);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const closeView = useStudioStore((state) => state.closeView);
  const setCommandPaletteOpen = useStudioStore((state) => state.setCommandPaletteOpen);
  const toggleCommandPalette = useStudioStore((state) => state.toggleCommandPalette);
  const openFlow = useStudioStore((state) => state.setCurrentFlow);
  const saveFlow = useStudioStore((state) => state.saveFlow);
  const createFlow = useStudioStore((state) => state.createFlow);
  const executeFlow = useStudioStore((state) => state.executeFlow);
  const reloadProject = useStudioStore((state) => state.reloadProject);
  const saveSession = useStudioStore((state) => state.saveSession);
  const deleteSession = useStudioStore((state) => state.deleteSession);
  const updateConfig = useStudioStore((state) => state.updateConfig);
  const createRun = useStudioStore((state) => state.createRun);
  const createSmokeRun = useStudioStore((state) => state.createSmokeRun);
  const listRuns = useStudioStore((state) => state.listRuns);
  const getRun = useStudioStore((state) => state.getRun);
  const getRunState = useStudioStore((state) => state.getRunState);
  const refreshRuns = useStudioStore((state) => state.refreshRuns);
  const selectRun = useStudioStore((state) => state.selectRun);
  const deleteRun = useStudioStore((state) => state.deleteRun);
  const clearFinishedRuns = useStudioStore((state) => state.clearFinishedRuns);
  const advanceRun = useStudioStore((state) => state.advanceRun);
  const retryRun = useStudioStore((state) => state.retryRun);
  const stepRun = useStudioStore((state) => state.stepRun);
  const replayRun = useStudioStore((state) => state.replayRun);
  const toggleBreakpoint = useStudioStore((state) => state.toggleBreakpoint);
  const clearBreakpoint = useStudioStore((state) => state.clearBreakpoint);
  const cancelRun = useStudioStore((state) => state.cancelRun);
  const createCheckpoint = useStudioStore((state) => state.createCheckpoint);
  const restoreCheckpoint = useStudioStore((state) => state.restoreCheckpoint);
  const refreshDiagnostics = useStudioStore((state) => state.refreshDiagnostics);
  const undo = useStudioStore((state) => state.undo);
  const redo = useStudioStore((state) => state.redo);
  const setExtensionEnabled = useStudioStore((state) => state.setExtensionEnabled);
  const activateExtension = useStudioStore((state) => state.activateExtension);
  const clearExtensionError = useStudioStore((state) => state.clearExtensionError);
  const markExtensionError = useStudioStore((state) => state.markExtensionError);
  const recordKernelEvent = useStudioStore((state) => state.recordKernelEvent);
  const refreshGitStatus = useStudioStore((state) => state.refreshGitStatus);
  const refreshReferences = useStudioStore((state) => state.refreshReferences);
  const searchProject = useStudioStore((state) => state.searchProject);
  const registerPanelCallbacks = useStudioStore((state) => state.registerPanelCallbacks);
  const clearPanelCallbacks = useStudioStore((state) => state.clearPanelCallbacks);

  return {
    connect,
    disconnect,
    setActiveView,
    closeView,
    setCommandPaletteOpen,
    toggleCommandPalette,
    openFlow,
    saveFlow,
    createFlow,
    executeFlow,
    reloadProject,
    saveSession,
    deleteSession,
    updateConfig,
    createRun,
    createSmokeRun,
    listRuns,
    refreshRuns,
    getRun,
    getRunState,
    selectRun,
    deleteRun,
    clearFinishedRuns,
    advanceRun,
    retryRun,
    stepRun,
    replayRun,
    toggleBreakpoint,
    clearBreakpoint,
    cancelRun,
    createCheckpoint,
    restoreCheckpoint,
    refreshDiagnostics,
    undo,
    redo,
    setExtensionEnabled,
    activateExtension,
    clearExtensionError,
    markExtensionError,
    recordKernelEvent,
    refreshGitStatus,
    refreshReferences,
    searchProject,
    registerPanelCallbacks,
    clearPanelCallbacks,
  };
}

export function useRunService(): RunService {
  return runService;
}
