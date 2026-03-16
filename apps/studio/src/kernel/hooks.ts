import { useStudioStore } from '@/store/studioStore';
import {
  getStudioDebugViews,
  getStudioExtensionForView,
  getStudioExtensionsByKind,
  getStudioInspectors,
  getStudioPanels,
  getStudioView,
  OFFICIAL_STUDIO_EXTENSIONS,
  STUDIO_VIEWS,
} from './registry';
import { runService } from './services/run-service';
import type { PromptPreviewEntry, ResourceId } from '@/types/project';
import type {
  ResolvedStudioCapabilityRequest,
  StudioContextValue,
  StudioContributionDescriptor,
  StudioDebugViewDescriptor,
  StudioExtensionId,
  StudioExtensionRuntimeRecord,
  StudioInspectorDescriptor,
  StudioPanelDescriptor,
} from './types';

export function useWorkbench() {
  const activeViewId = useStudioStore((state) => state.workbench.activeViewId);
  const openViewIds = useStudioStore((state) => state.workbench.openViewIds);
  const activeFlowId = useStudioStore((state) => state.workbench.activeFlowId);
  const activePreset = useStudioStore((state) => state.workbench.activePreset);
  const commandPaletteOpen = useStudioStore((state) => state.workbench.commandPaletteOpen);
  const extensionRuntime = useStudioStore((state) => state.extensions.records);
  const activeView = getStudioView(activeViewId);
  const activeExtension = getStudioExtensionForView(activeViewId);
  const activeExtensionRuntime = activeExtension ? extensionRuntime[activeExtension.id] ?? null : null;
  const openViews = openViewIds
    .map((viewId) => STUDIO_VIEWS.find((view) => view.id === viewId) ?? null)
    .filter((view): view is (typeof STUDIO_VIEWS)[number] => Boolean(view));
  const resolvedOpenViews = openViews.length > 0 ? openViews : [activeView];

  return {
    activeViewId,
    openViewIds,
    openViews: resolvedOpenViews,
    activeFlowId,
    activePreset,
    commandPaletteOpen,
    activeView,
    activeExtension,
    activeExtensionRuntime,
    views: STUDIO_VIEWS,
    extensions: OFFICIAL_STUDIO_EXTENSIONS,
    coreExtensions: getStudioExtensionsByKind('official-core'),
    workflowExtensions: getStudioExtensionsByKind('official-workflow'),
  };
}

export function useStudioResources() {
  const project = useStudioStore((state) => state.resources.project);

  return {
    project,
    config: project?.config ?? null,
    state: project?.state ?? {},
    session: project?.session ?? null,
    nodeManifests: project?.nodeManifests ?? [],
  };
}

export function useFlowResource(flowId?: string | null) {
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

export function usePromptPreview() {
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

export function useConnectionState() {
  return useStudioStore((state) => state.connection);
}

export function useSaveState() {
  return useStudioStore((state) => state.saveState);
}

export function useVersionControl() {
  return useStudioStore((state) => state.versionControl);
}

export function useExtensionRuntime(extensionId?: StudioExtensionId | null) {
  return useStudioStore((state) =>
    extensionId ? state.extensions.records[extensionId] ?? null : state.extensions.records,
  );
}

export function useExtensionRuntimeMap() {
  return useStudioStore((state) => state.extensions.records);
}

export function useKernelEvents(limit = 50) {
  return useStudioStore((state) => state.kernel.events.slice(0, limit));
}

export function useKernelJobs() {
  return useStudioStore((state) => state.kernel.jobs);
}

export function useDiagnostics() {
  const diagnostics = useStudioStore((state) => state.versionControl.diagnostics);
  const updatedAt = useStudioStore((state) => state.versionControl.diagnosticsUpdatedAt);

  return {
    diagnostics,
    updatedAt,
  };
}

export function useRunDebug() {
  const selectedRunId = useStudioStore((state) => state.runDebug.selectedRunId);
  const runOrder = useStudioStore((state) => state.runDebug.runOrder);
  const records = useStudioStore((state) => state.runDebug.records);
  const selectedRecord = selectedRunId ? records[selectedRunId] ?? null : null;
  const runs = runOrder
    .map((runId) => records[runId] ?? null)
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  return {
    selectedRunId,
    selectedRecord,
    selectedRun: selectedRecord?.run ?? null,
    selectedRunState: selectedRecord?.state ?? null,
    selectedTimeline: selectedRecord?.timeline ?? [],
    selectedStateDiff: selectedRecord?.stateDiff ?? [],
    runs,
    records,
  };
}

export function useResourceVersion(resourceId?: ResourceId | null) {
  return useStudioStore((state) =>
    resourceId ? state.versionControl.resourceVersions[resourceId] ?? null : null,
  );
}

export function useCapabilityGate(capabilities?: ResolvedStudioCapabilityRequest[]) {
  const grants = useStudioStore((state) => state.capabilities.grants);

  const resolved = (capabilities ?? []).map((request) => ({
    ...request,
    capability: request.capability,
    granted: Boolean(grants[request.capability]),
  }));

  return {
    grants,
    resolved,
    trusted: resolved.every((entry) => entry.granted || !entry.required),
    blocked: resolved.filter((entry) => !entry.granted && (entry.required || entry.restrictedMode === 'block')),
    degraded: resolved.filter((entry) => !entry.granted && !entry.required && entry.restrictedMode === 'degrade'),
  };
}

function matchesPreset(
  contribution: StudioContributionDescriptor,
  activePreset: ReturnType<typeof useWorkbench>['activePreset'],
) {
  return !contribution.presets || contribution.presets.includes(activePreset);
}

function resolveContributions<T extends StudioPanelDescriptor | StudioInspectorDescriptor | StudioDebugViewDescriptor>(
  contributions: T[],
  activePreset: ReturnType<typeof useWorkbench>['activePreset'],
  runtime: Record<string, StudioExtensionRuntimeRecord>,
) {
  return contributions
    .filter((contribution) => matchesPreset(contribution, activePreset))
    .map((contribution) => ({
      contribution,
      runtime: runtime[contribution.extensionId] ?? null,
    }));
}

export function usePanelContributions() {
  const { activePreset } = useWorkbench();
  const runtime = useStudioStore((state) => state.extensions.records);
  return resolveContributions(getStudioPanels(), activePreset, runtime);
}

export function useInspectorContributions() {
  const { activePreset } = useWorkbench();
  const runtime = useStudioStore((state) => state.extensions.records);
  return resolveContributions(getStudioInspectors(), activePreset, runtime);
}

export function useDebugViewContributions() {
  const { activePreset } = useWorkbench();
  const runtime = useStudioStore((state) => state.extensions.records);
  return resolveContributions(getStudioDebugViews(), activePreset, runtime);
}

export function useWorkbenchContext() {
  const { project, session } = useStudioResources();
  const { engineConnected, connectionError } = useConnectionState();
  const saveState = useSaveState();
  const versionControl = useVersionControl();
  const { activeExtension, activeExtensionRuntime, activeFlowId, activePreset, activeViewId } = useWorkbench();
  const capabilityGate = useCapabilityGate();

  const values: Record<string, StudioContextValue> = {
    'project.loaded': Boolean(project),
    'engine.connected': engineConnected,
    'engine.connectionError': connectionError,
    'flow.active': activeFlowId,
    'session.available': Boolean(session),
    'save.status': saveState.status,
    'workbench.view': activeViewId,
    'workbench.preset': activePreset,
    'extension.active': activeExtension?.id ?? null,
    'extension.status': activeExtensionRuntime?.status ?? null,
    'capability.project.write': Boolean(capabilityGate.grants['project.write']),
    'capability.engine.execute': Boolean(capabilityGate.grants['engine.execute']),
    'capability.trace.read': Boolean(capabilityGate.grants['trace.read']),
    'diagnostics.available': Boolean(versionControl.diagnostics),
    'history.undoAvailable': versionControl.undoStack.length > 0,
    'history.redoAvailable': versionControl.redoStack.length > 0,
  };

  return { values };
}

export function useStudioCommands() {
  const connect = useStudioStore((state) => state.connect);
  const disconnect = useStudioStore((state) => state.disconnect);
  const setActiveView = useStudioStore((state) => state.setActiveView);
  const closeView = useStudioStore((state) => state.closeView);
  const setActivePreset = useStudioStore((state) => state.setActivePreset);
  const setCommandPaletteOpen = useStudioStore((state) => state.setCommandPaletteOpen);
  const toggleCommandPalette = useStudioStore((state) => state.toggleCommandPalette);
  const openFlow = useStudioStore((state) => state.setCurrentFlow);
  const saveFlow = useStudioStore((state) => state.saveFlow);
  const createFlow = useStudioStore((state) => state.createFlow);
  const executeFlow = useStudioStore((state) => state.executeFlow);
  const reloadProject = useStudioStore((state) => state.reloadProject);
  const saveSession = useStudioStore((state) => state.saveSession);
  const deleteSession = useStudioStore((state) => state.deleteSession);
  const createRun = useStudioStore((state) => state.createRun);
  const listRuns = useStudioStore((state) => state.listRuns);
  const getRun = useStudioStore((state) => state.getRun);
  const getRunState = useStudioStore((state) => state.getRunState);
  const refreshRuns = useStudioStore((state) => state.refreshRuns);
  const selectRun = useStudioStore((state) => state.selectRun);
  const advanceRun = useStudioStore((state) => state.advanceRun);
  const cancelRun = useStudioStore((state) => state.cancelRun);
  const createCheckpoint = useStudioStore((state) => state.createCheckpoint);
  const restoreCheckpoint = useStudioStore((state) => state.restoreCheckpoint);
  const refreshDiagnostics = useStudioStore((state) => state.refreshDiagnostics);
  const undo = useStudioStore((state) => state.undo);
  const redo = useStudioStore((state) => state.redo);
  const setCapabilityGrant = useStudioStore((state) => state.setCapabilityGrant);
  const resetCapabilityGrants = useStudioStore((state) => state.resetCapabilityGrants);
  const setExtensionEnabled = useStudioStore((state) => state.setExtensionEnabled);
  const activateExtension = useStudioStore((state) => state.activateExtension);
  const clearExtensionError = useStudioStore((state) => state.clearExtensionError);
  const markExtensionError = useStudioStore((state) => state.markExtensionError);
  const recordKernelEvent = useStudioStore((state) => state.recordKernelEvent);

  return {
    connect,
    disconnect,
    setActiveView,
    closeView,
    setActivePreset,
    setCommandPaletteOpen,
    toggleCommandPalette,
    openFlow,
    saveFlow,
    createFlow,
    executeFlow,
    reloadProject,
    saveSession,
    deleteSession,
    createRun,
    listRuns,
    refreshRuns,
    getRun,
    getRunState,
    selectRun,
    advanceRun,
    cancelRun,
    createCheckpoint,
    restoreCheckpoint,
    refreshDiagnostics,
    undo,
    redo,
    setCapabilityGrant,
    resetCapabilityGrants,
    setExtensionEnabled,
    activateExtension,
    clearExtensionError,
    markExtensionError,
    recordKernelEvent,
  };
}

export function useRunService() {
  return runService;
}
