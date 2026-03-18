import { Bug, CircleAlert, ClipboardCheck, Database, FlaskConical, History, LayoutDashboard, LayoutTemplate, MessageSquareMore, MonitorPlay, Package, Rocket, Route, Settings } from 'lucide-react';
import { CollaboratorsPanel } from '@/components/CollaboratorsPanel';
import { CommentsPanel } from '@/components/CommentsPanel';
import { CommentsView } from '@/components/CommentsView';
import Flow from '@/Flow';
import SessionEditor from '@/SessionEditor';
import { ConfigEditor } from '@/components/ConfigEditor';
import { DebuggerSummaryView } from '@/components/DebuggerSummaryView';
import { DebuggerView } from '@/components/DebuggerView';
import { EventLogPanel } from '@/components/EventLogPanel';
import { H5PreviewView } from '@/components/H5PreviewView';
import { PackageManagerView } from '@/components/PackageManagerView';
import { PromptPreviewInspector } from '@/components/PromptPreviewInspector';
import { ProblemsPanel } from '@/components/ProblemsPanel';
import { ProblemsView } from '@/components/ProblemsView';
import { ReviewHistoryPanel } from '@/components/ReviewHistoryPanel';
import { ReviewView } from '@/components/ReviewView';
import { TemplateBrowserView } from '@/components/TemplateBrowserView';
import { TerminalView } from '@/components/TerminalView';
import { DeployView } from '@/components/DeployView';
import { EvalView } from '@/components/EvalView';
import { StateDiffPanel } from '@/components/StateDiffPanel';
import { StateInspectorCard } from '@/components/StateInspectorCard';
import { StateManager } from '@/components/StateManager';
import { TracePanel } from '@/components/TracePanel';
import { VersionControlPanel } from '@/components/VersionControlPanel';
import { VersionControlView } from '@/components/VersionControlView';
import type {
  StudioContributionDescriptor,
  StudioCapabilityCatalogEntry,
  StudioCapabilityId,
  StudioExtensionCapabilityRequest,
  StudioDebugViewDescriptor,
  StudioActivationEvent,
  StudioExtensionContributions,
  StudioExtensionDescriptor,
  StudioExtensionId,
  StudioExtensionHost,
  StudioExtensionKind,
  StudioRegisteredExtensionDescriptor,
  StudioInspectorDescriptor,
  StudioPanelDescriptor,
  StudioViewDescriptor,
  StudioViewId,
} from './types';

type StudioRegistry = {
  extensions: StudioRegisteredExtensionDescriptor[];
  views: StudioViewDescriptor[];
  panels: StudioPanelDescriptor[];
  inspectors: StudioInspectorDescriptor[];
  debugViews: StudioDebugViewDescriptor[];
};

const CAPABILITY_CATALOG: Record<StudioCapabilityId, StudioCapabilityCatalogEntry> = {
  'project.read': {
    id: 'project.read',
    title: 'capability.projectRead.title',
    description: 'capability.projectRead.description',
    host: 'browser',
    scope: 'project',
    approvalStrategy: 'auto',
    prompt: 'capability.projectRead.prompt',
  },
  'project.write': {
    id: 'project.write',
    title: 'capability.projectWrite.title',
    description: 'capability.projectWrite.description',
    host: 'browser',
    scope: 'project',
    approvalStrategy: 'prompt',
    prompt: 'capability.projectWrite.prompt',
  },
  'engine.execute': {
    id: 'engine.execute',
    title: 'capability.engineExecute.title',
    description: 'capability.engineExecute.description',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'prompt',
    prompt: 'capability.engineExecute.prompt',
  },
  'engine.debug': {
    id: 'engine.debug',
    title: 'capability.engineDebug.title',
    description: 'capability.engineDebug.description',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'prompt',
    prompt: 'capability.engineDebug.prompt',
  },
  'trace.read': {
    id: 'trace.read',
    title: 'capability.traceRead.title',
    description: 'capability.traceRead.description',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'auto',
    prompt: 'capability.traceRead.prompt',
  },
  'network.fetch': {
    id: 'network.fetch',
    title: 'capability.networkFetch.title',
    description: 'capability.networkFetch.description',
    host: 'workspace',
    scope: 'user',
    approvalStrategy: 'prompt',
    prompt: 'capability.networkFetch.prompt',
  },
  'process.exec': {
    id: 'process.exec',
    title: 'capability.processExec.title',
    description: 'capability.processExec.description',
    host: 'workspace',
    scope: 'user',
    approvalStrategy: 'admin',
    prompt: 'capability.processExec.prompt',
  },
  'package.install': {
    id: 'package.install',
    title: 'capability.packageInstall.title',
    description: 'capability.packageInstall.description',
    host: 'workspace',
    scope: 'org',
    approvalStrategy: 'admin',
    prompt: 'capability.packageInstall.prompt',
  },
  'package.publish': {
    id: 'package.publish',
    title: 'capability.packagePublish.title',
    description: 'capability.packagePublish.description',
    host: 'workspace',
    scope: 'org',
    approvalStrategy: 'admin',
    prompt: 'capability.packagePublish.prompt',
  },
  'comment.write': {
    id: 'comment.write',
    title: 'capability.commentWrite.title',
    description: 'capability.commentWrite.description',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'prompt',
    prompt: 'capability.commentWrite.prompt',
  },
  'review.accept': {
    id: 'review.accept',
    title: 'capability.reviewAccept.title',
    description: 'capability.reviewAccept.description',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'admin',
    prompt: 'capability.reviewAccept.prompt',
  },
  'ai.invoke': {
    id: 'ai.invoke',
    title: 'capability.aiInvoke.title',
    description: 'capability.aiInvoke.description',
    host: 'service',
    scope: 'user',
    approvalStrategy: 'prompt',
    prompt: 'capability.aiInvoke.prompt',
  },
};

function resolveCapabilityRequests(
  requests: StudioExtensionCapabilityRequest[],
) {
  return requests.map((request) => {
    const descriptor = CAPABILITY_CATALOG[request.capability];
    if (!descriptor) {
      throw new Error(`Unknown capability: ${request.capability}`);
    }

    return {
      ...request,
      descriptor,
      required: request.required !== false,
      restrictedMode: request.restrictedMode ?? (request.required === false ? 'degrade' : 'block'),
      prompt: request.prompt ?? descriptor.prompt,
    };
  });
}

function normalizeContributions(
  extensionId: StudioExtensionId,
  contributions: StudioExtensionContributions,
): StudioExtensionContributions {
  return {
    views: (contributions.views ?? []).map((view) => ({
      ...view,
      extensionId,
      surface: 'view',
    })),
    panels: (contributions.panels ?? []).map((panel) => ({
      ...panel,
      extensionId,
      surface: 'panel',
    })),
    inspectors: (contributions.inspectors ?? []).map((inspector) => ({
      ...inspector,
      extensionId,
      surface: 'inspector',
    })),
    debugViews: (contributions.debugViews ?? []).map((debugView) => ({
      ...debugView,
      extensionId,
      surface: 'debug-view',
    })),
    commands: contributions.commands ?? [],
  };
}

function assertUniqueIds(items: StudioContributionDescriptor[], scope: string) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`Duplicate ${scope} id: ${item.id}`);
    }
    seen.add(item.id);
  }
}

function createStudioRegistry(extensions: StudioExtensionDescriptor[]): StudioRegistry {
  const normalizedExtensions = extensions.map((extension) => ({
    ...extension,
    capabilities: resolveCapabilityRequests(extension.capabilities),
    contributes: normalizeContributions(extension.id, extension.contributes),
  }));

  const extensionIds = normalizedExtensions.map((extension) => extension.id);
  if (new Set(extensionIds).size !== extensionIds.length) {
    throw new Error('Duplicate studio extension id detected');
  }

  const views = normalizedExtensions.flatMap((extension) => extension.contributes.views ?? []);
  const panels = normalizedExtensions.flatMap((extension) => extension.contributes.panels ?? []);
  const inspectors = normalizedExtensions.flatMap((extension) => extension.contributes.inspectors ?? []);
  const debugViews = normalizedExtensions.flatMap((extension) => extension.contributes.debugViews ?? []);

  assertUniqueIds(views, 'view');
  assertUniqueIds(panels, 'panel');
  assertUniqueIds(inspectors, 'inspector');
  assertUniqueIds(debugViews, 'debug view');

  return {
    extensions: normalizedExtensions,
    views,
    panels,
    inspectors,
    debugViews,
  };
}

const registry = createStudioRegistry([
  {
    id: 'kal.flow-editor',
    title: 'ext.flowEditor.title',
    description: 'ext.flowEditor.description',
    kind: 'official-core',
    host: 'browser',
    activationEvents: ['onView:kal.flow'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'project.write' },
      { capability: 'engine.execute', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.flow',
          extensionId: 'kal.flow-editor',
          title: 'ext.flowEditor.viewTitle',
          shortTitle: 'ext.flowEditor.shortTitle',
          description: 'ext.flowEditor.viewDescription',
          icon: LayoutDashboard,
          component: Flow,
          presets: ['authoring', 'debug', 'review'],
        },
      ],
    },
  },
  {
    id: 'kal.session-editor',
    title: 'ext.sessionEditor.title',
    description: 'ext.sessionEditor.description',
    kind: 'official-core',
    host: 'browser',
    activationEvents: ['onView:kal.session', 'onCommand:kal.session.run'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'project.write' },
      { capability: 'engine.execute', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.session',
          extensionId: 'kal.session-editor',
          title: 'ext.sessionEditor.viewTitle',
          shortTitle: 'ext.sessionEditor.shortTitle',
          description: 'ext.sessionEditor.viewDescription',
          icon: Route,
          component: SessionEditor,
          presets: ['authoring', 'debug'],
        },
      ],
    },
  },
  {
    id: 'kal.state-editor',
    title: 'ext.stateEditor.title',
    description: 'ext.stateEditor.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.state', 'onEvent:run.updated'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'trace.read', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.state',
          extensionId: 'kal.state-editor',
          title: 'ext.stateEditor.viewTitle',
          shortTitle: 'ext.stateEditor.shortTitle',
          description: 'ext.stateEditor.viewDescription',
          icon: Database,
          component: StateManager,
          presets: ['authoring', 'debug', 'review'],
        },
      ],
      inspectors: [
        {
          id: 'kal.state.inspector',
          extensionId: 'kal.state-editor',
          title: 'ext.stateEditor.inspectorTitle',
          description: 'ext.stateEditor.inspectorDescription',
          component: StateInspectorCard,
          slot: 'right',
          presets: ['authoring', 'debug', 'review'],
        },
      ],
    },
  },
  {
    id: 'kal.config-editor',
    title: 'ext.configEditor.title',
    description: 'ext.configEditor.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.config'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'project.write' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.config',
          extensionId: 'kal.config-editor',
          title: 'ext.configEditor.viewTitle',
          shortTitle: 'ext.configEditor.shortTitle',
          description: 'ext.configEditor.viewDescription',
          icon: Settings,
          component: ConfigEditor,
          presets: ['authoring'],
        },
      ],
    },
  },
  {
    id: 'kal.problems',
    title: 'ext.problems.title',
    description: 'ext.problems.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.problems', 'onEvent:diagnostics.updated'],
    capabilities: [{ capability: 'project.read' }],
    contributes: {
      views: [
        {
          id: 'kal.problems',
          extensionId: 'kal.problems',
          title: 'ext.problems.viewTitle',
          shortTitle: 'ext.problems.shortTitle',
          description: 'ext.problems.viewDescription',
          icon: CircleAlert,
          component: ProblemsView,
          presets: ['authoring', 'debug', 'review'],
        },
      ],
      panels: [
        {
          id: 'kal.problems.panel',
          extensionId: 'kal.problems',
          title: 'ext.problems.panelTitle',
          description: 'ext.problems.panelDescription',
          component: ProblemsPanel,
          slot: 'down',
          presets: ['authoring', 'debug', 'review'],
          order: 10,
        },
      ],
    },
  },
  {
    id: 'kal.prompt-preview',
    title: 'ext.promptPreview.title',
    description: 'ext.promptPreview.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: [],
    capabilities: [{ capability: 'project.read' }],
    contributes: {
      inspectors: [
        {
          id: 'kal.prompt-preview.inspector',
          extensionId: 'kal.prompt-preview',
          title: 'ext.promptPreview.inspectorTitle',
          description: 'ext.promptPreview.inspectorDescription',
          component: PromptPreviewInspector,
          slot: 'right',
          presets: ['authoring', 'debug'],
        },
      ],
    },
  },
  {
    id: 'kal.debugger',
    title: 'ext.debugger.title',
    description: 'ext.debugger.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.debugger', 'onEvent:run.updated'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'engine.execute', required: false, restrictedMode: 'degrade' },
      { capability: 'trace.read', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.debugger',
          extensionId: 'kal.debugger',
          title: 'ext.debugger.viewTitle',
          shortTitle: 'ext.debugger.shortTitle',
          description: 'ext.debugger.viewDescription',
          icon: Bug,
          component: DebuggerView,
          presets: ['debug'],
        },
      ],
      debugViews: [
        {
          id: 'kal.debugger.summary',
          extensionId: 'kal.debugger',
          title: 'ext.debugger.summaryTitle',
          description: 'ext.debugger.summaryDescription',
          component: DebuggerSummaryView,
          slot: 'right',
          presets: ['debug'],
          order: 20,
        },
      ],
      panels: [
        {
          id: 'kal.debugger.trace-panel',
          extensionId: 'kal.debugger',
          title: 'ext.debugger.tracePanelTitle',
          description: 'ext.debugger.tracePanelDescription',
          component: TracePanel,
          slot: 'down',
          presets: ['debug', 'review'],
          order: 15,
        },
        {
          id: 'kal.debugger.state-diff-panel',
          extensionId: 'kal.debugger',
          title: 'ext.debugger.stateDiffPanelTitle',
          description: 'ext.debugger.stateDiffPanelDescription',
          component: StateDiffPanel,
          slot: 'down',
          presets: ['debug', 'review'],
          order: 16,
        },
      ],
    },
  },
  {
    id: 'kal.h5-preview',
    title: 'ext.h5Preview.title',
    description: 'ext.h5Preview.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.h5-preview', 'onEvent:run.updated'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'trace.read', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.h5-preview',
          extensionId: 'kal.h5-preview',
          title: 'ext.h5Preview.viewTitle',
          shortTitle: 'ext.h5Preview.shortTitle',
          description: 'ext.h5Preview.viewDescription',
          icon: MonitorPlay,
          component: H5PreviewView,
          presets: ['debug'],
        },
      ],
    },
  },
  {
    id: 'kal.comments',
    title: 'ext.comments.title',
    description: 'ext.comments.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.comments', 'onEvent:review.changed'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'comment.write', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.comments',
          extensionId: 'kal.comments',
          title: 'ext.comments.viewTitle',
          shortTitle: 'ext.comments.shortTitle',
          description: 'ext.comments.viewDescription',
          icon: MessageSquareMore,
          component: CommentsView,
          presets: ['review'],
        },
      ],
      inspectors: [
        {
          id: 'kal.comments.inspector',
          extensionId: 'kal.comments',
          title: 'ext.comments.inspectorTitle',
          description: 'ext.comments.inspectorDescription',
          component: CommentsView,
          slot: 'right',
          presets: ['review'],
        },
      ],
      panels: [
        {
          id: 'kal.comments.panel',
          extensionId: 'kal.comments',
          title: 'ext.comments.panelTitle',
          description: 'ext.comments.panelDescription',
          component: CommentsPanel,
          slot: 'down',
          presets: ['review', 'history'],
          order: 24,
        },
      ],
    },
  },
  {
    id: 'kal.review',
    title: 'ext.review.title',
    description: 'ext.review.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.review', 'onEvent:review.changed'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'project.write', required: false, restrictedMode: 'degrade' },
      { capability: 'trace.read', required: false, restrictedMode: 'degrade' },
      { capability: 'review.accept', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.review',
          extensionId: 'kal.review',
          title: 'ext.review.viewTitle',
          shortTitle: 'ext.review.shortTitle',
          description: 'ext.review.viewDescription',
          icon: ClipboardCheck,
          component: ReviewView,
          presets: ['review'],
        },
      ],
      panels: [
        {
          id: 'kal.review.history-panel',
          extensionId: 'kal.review',
          title: 'ext.review.historyPanelTitle',
          description: 'ext.review.historyPanelDescription',
          component: ReviewHistoryPanel,
          slot: 'down',
          presets: ['review', 'history'],
          order: 25,
        },
      ],
    },
  },
  {
    id: 'kal.version-control',
    title: 'ext.versionControl.title',
    description: 'ext.versionControl.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.version-control', 'onCommand:kal.version-control.focus'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'project.write' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.version-control',
          extensionId: 'kal.version-control',
          title: 'ext.versionControl.viewTitle',
          shortTitle: 'ext.versionControl.shortTitle',
          description: 'ext.versionControl.viewDescription',
          icon: History,
          component: VersionControlView,
          presets: ['review', 'history'],
        },
      ],
      panels: [
        {
          id: 'kal.version-control.panel',
          extensionId: 'kal.version-control',
          title: 'ext.versionControl.panelTitle',
          description: 'ext.versionControl.panelDescription',
          component: VersionControlPanel,
          slot: 'down',
          presets: ['review', 'history'],
          order: 20,
        },
      ],
    },
  },
  {
    id: 'kal.event-log',
    title: 'ext.eventLog.title',
    description: 'ext.eventLog.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.debugger', 'onEvent:diagnostics.updated', 'onEvent:run.updated', 'onEvent:history.updated'],
    capabilities: [
      { capability: 'project.read', required: false, restrictedMode: 'degrade' },
      { capability: 'trace.read', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      panels: [
        {
          id: 'kal.event-log.panel',
          extensionId: 'kal.event-log',
          title: 'ext.eventLog.panelTitle',
          description: 'ext.eventLog.panelDescription',
          component: EventLogPanel,
          slot: 'down',
          presets: ['debug', 'review', 'history'],
          order: 30,
        },
      ],
    },
  },
  {
    id: 'kal.package-manager',
    title: 'ext.packageManager.title',
    description: 'ext.packageManager.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.package-manager'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'package.install', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.package-manager',
          extensionId: 'kal.package-manager',
          title: 'ext.packageManager.viewTitle',
          shortTitle: 'ext.packageManager.shortTitle',
          description: 'ext.packageManager.viewDescription',
          icon: Package,
          component: PackageManagerView,
          presets: ['package'],
        },
      ],
    },
  },
  {
    id: 'kal.template-browser',
    title: 'ext.templateBrowser.title',
    description: 'ext.templateBrowser.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.template-browser'],
    capabilities: [
      { capability: 'project.read' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.template-browser',
          extensionId: 'kal.template-browser',
          title: 'ext.templateBrowser.viewTitle',
          shortTitle: 'ext.templateBrowser.shortTitle',
          description: 'ext.templateBrowser.viewDescription',
          icon: LayoutTemplate,
          component: TemplateBrowserView,
          presets: ['package'],
        },
      ],
    },
  },
  {
    id: 'kal.collaborators',
    title: 'ext.collaborators.title',
    description: 'ext.collaborators.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.debugger', 'onView:kal.review'],
    capabilities: [
      { capability: 'project.read', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      panels: [
        {
          id: 'kal.collaborators.panel',
          extensionId: 'kal.collaborators',
          title: 'ext.collaborators.panelTitle',
          description: 'ext.collaborators.panelDescription',
          component: CollaboratorsPanel,
          slot: 'down',
          presets: ['review', 'debug'],
          order: 35,
        },
      ],
    },
  },
  {
    id: 'kal.terminal',
    title: 'ext.terminal.title',
    description: 'ext.terminal.description',
    kind: 'official-workflow',
    host: 'workspace',
    activationEvents: ['onView:kal.terminal'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'process.exec', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      panels: [
        {
          id: 'kal.terminal.panel',
          extensionId: 'kal.terminal',
          title: 'ext.terminal.panelTitle',
          description: 'ext.terminal.panelDescription',
          component: TerminalView,
          slot: 'down',
          presets: ['debug'],
          order: 40,
        },
      ],
    },
  },
  {
    id: 'kal.vercel-deploy',
    title: 'ext.vercelDeploy.title',
    description: 'ext.vercelDeploy.description',
    kind: 'official-workflow',
    host: 'workspace',
    activationEvents: ['onView:kal.vercel-deploy'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'network.fetch', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.vercel-deploy',
          extensionId: 'kal.vercel-deploy',
          title: 'ext.vercelDeploy.viewTitle',
          shortTitle: 'ext.vercelDeploy.shortTitle',
          description: 'ext.vercelDeploy.viewDescription',
          icon: Rocket,
          component: DeployView,
          presets: ['package'],
        },
      ],
    },
  },
  {
    id: 'kal.prompt-eval',
    title: 'ext.promptEval.title',
    description: 'ext.promptEval.description',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.prompt-eval'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'engine.execute' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.prompt-eval',
          extensionId: 'kal.prompt-eval',
          title: 'ext.promptEval.viewTitle',
          shortTitle: 'ext.promptEval.shortTitle',
          description: 'ext.promptEval.viewDescription',
          icon: FlaskConical,
          component: EvalView,
          presets: ['debug'],
        },
      ],
    },
  },
]);

export const OFFICIAL_STUDIO_EXTENSIONS = registry.extensions;
export const DEFAULT_STUDIO_VIEW_ID: StudioViewId = 'kal.flow';
export const STUDIO_VIEWS = registry.views;
export const STUDIO_PANELS = registry.panels;
export const STUDIO_INSPECTORS = registry.inspectors;
export const STUDIO_DEBUG_VIEWS = registry.debugViews;

function sortByOrder<T extends { order?: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => (left.order ?? 100) - (right.order ?? 100));
}

export function getStudioView(viewId: StudioViewId): StudioViewDescriptor {
  return getAllViews().find((view) => view.id === viewId) ?? STUDIO_VIEWS[0]!;
}

export function getStudioExtension(extensionId: StudioExtensionId): StudioRegisteredExtensionDescriptor | null {
  return getAllExtensions().find((extension) => extension.id === extensionId) ?? null;
}

export function getStudioExtensionForView(viewId: StudioViewId): StudioRegisteredExtensionDescriptor | null {
  const view = getStudioView(viewId);
  return getStudioExtension(view.extensionId);
}

export function getStudioExtensionsByKind(kind: StudioExtensionKind): StudioRegisteredExtensionDescriptor[] {
  return getAllExtensions().filter((extension) => extension.kind === kind);
}

export function getStudioPanels() {
  return sortByOrder(STUDIO_PANELS);
}

export function getStudioInspectors() {
  return sortByOrder(STUDIO_INSPECTORS);
}

export function getStudioDebugViews() {
  return sortByOrder(STUDIO_DEBUG_VIEWS);
}

export function getStudioCapabilityCatalog() {
  return CAPABILITY_CATALOG;
}

// ── Dynamic Third-party Extension Registration ──

const ALLOWED_THIRD_PARTY_KINDS: Set<string> = new Set([
  'theme-pack',
  'node-pack',
  'template-pack',
]);

const dynamicExtensions: StudioRegisteredExtensionDescriptor[] = [];
const dynamicViews: StudioViewDescriptor[] = [];
const dynamicPanels: StudioPanelDescriptor[] = [];

export type DynamicExtensionInput = {
  id: StudioExtensionId;
  title: string;
  description: string;
  kind: string;
  host?: StudioExtensionHost;
  activationEvents?: StudioActivationEvent[];
  capabilities?: StudioExtensionCapabilityRequest[];
  contributes?: StudioExtensionContributions;
};

export type DynamicRegistrationResult =
  | { ok: true; extensionId: StudioExtensionId }
  | { ok: false; reason: string };

/**
 * 运行时注册第三方扩展。
 *
 * 当前仅允许 theme-pack / node-pack / template-pack 三种低风险类型。
 * studio-extension 等高风险类型需要后续逐步开放。
 */
export function registerDynamicExtension(input: DynamicExtensionInput): DynamicRegistrationResult {
  if (!ALLOWED_THIRD_PARTY_KINDS.has(input.kind)) {
    return { ok: false, reason: `Dynamic registration of ${input.kind} type extensions is not currently allowed` };
  }

  const existing = [...OFFICIAL_STUDIO_EXTENSIONS, ...dynamicExtensions].find((e) => e.id === input.id);
  if (existing) {
    return { ok: false, reason: `Extension ${input.id} is already registered` };
  }

  const descriptor: StudioExtensionDescriptor = {
    id: input.id,
    title: input.title,
    description: input.description,
    kind: 'third-party',
    host: input.host ?? 'browser',
    activationEvents: input.activationEvents ?? [],
    capabilities: input.capabilities ?? [],
    contributes: input.contributes ?? {},
  };

  const resolved: StudioRegisteredExtensionDescriptor = {
    ...descriptor,
    capabilities: resolveCapabilityRequests(descriptor.capabilities),
    contributes: normalizeContributions(descriptor.id, descriptor.contributes),
  };

  dynamicExtensions.push(resolved);

  for (const view of resolved.contributes.views ?? []) {
    dynamicViews.push(view);
  }
  for (const panel of resolved.contributes.panels ?? []) {
    dynamicPanels.push(panel);
  }

  return { ok: true, extensionId: input.id };
}

export function getDynamicExtensions(): StudioRegisteredExtensionDescriptor[] {
  return [...dynamicExtensions];
}

export function getAllExtensions(): StudioRegisteredExtensionDescriptor[] {
  return [...OFFICIAL_STUDIO_EXTENSIONS, ...dynamicExtensions];
}

export function getAllViews(): StudioViewDescriptor[] {
  return [...STUDIO_VIEWS, ...dynamicViews];
}

export function getAllPanels(): StudioPanelDescriptor[] {
  return sortByOrder([...STUDIO_PANELS, ...dynamicPanels]);
}
