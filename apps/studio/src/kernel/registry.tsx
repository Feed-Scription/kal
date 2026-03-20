import { Database, Gamepad2, History, LayoutDashboard, Route, Settings } from 'lucide-react';
import Flow from '@/Flow';
import SessionEditor from '@/SessionEditor';
import { ConfigEditor } from '@/components/ConfigEditor';
import { DebuggerSummaryView } from '@/components/DebuggerSummaryView';
import { PromptPreviewInspector } from '@/components/PromptPreviewInspector';
import { StateInspectorCard } from '@/components/StateInspectorCard';
import { StateManager } from '@/components/StateManager';
import { PlayPanel } from '@/components/TerminalView';
import { VersionControlView } from '@/components/VersionControlView';
import type {
  StudioContributionDescriptor,
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
    contributes: {
      inspectors: [
        {
          id: 'kal.prompt-preview.inspector',
          extensionId: 'kal.prompt-preview',
          title: 'ext.promptPreview.inspectorTitle',
          description: 'ext.promptPreview.inspectorDescription',
          component: PromptPreviewInspector,
          slot: 'right',
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
    activationEvents: ['onEvent:run.updated'],
    contributes: {
      debugViews: [
        {
          id: 'kal.debugger.summary',
          extensionId: 'kal.debugger',
          title: 'ext.debugger.summaryTitle',
          description: 'ext.debugger.summaryDescription',
          component: DebuggerSummaryView,
          slot: 'right',
          order: 20,
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
    activationEvents: ['onView:kal.play'],
    contributes: {
      views: [
        {
          id: 'kal.play',
          extensionId: 'kal.terminal',
          title: 'ext.terminal.viewTitle',
          shortTitle: 'ext.terminal.shortTitle',
          description: 'ext.terminal.viewDescription',
          icon: Gamepad2,
          component: PlayPanel,
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
    contributes: input.contributes ?? {},
  };

  const resolved: StudioRegisteredExtensionDescriptor = {
    ...descriptor,
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
