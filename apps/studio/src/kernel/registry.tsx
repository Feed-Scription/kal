import { Bug, CircleAlert, ClipboardCheck, Database, History, LayoutDashboard, LayoutTemplate, MessageSquareMore, MessageSquareQuote, MonitorPlay, Package, Rocket, Route, Settings, Terminal } from 'lucide-react';
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
import { PromptPreviewView } from '@/components/PromptPreviewView';
import { ProblemsPanel } from '@/components/ProblemsPanel';
import { ProblemsView } from '@/components/ProblemsView';
import { ReviewHistoryPanel } from '@/components/ReviewHistoryPanel';
import { ReviewView } from '@/components/ReviewView';
import { TemplateBrowserView } from '@/components/TemplateBrowserView';
import { TerminalView } from '@/components/TerminalView';
import { DeployView } from '@/components/DeployView';
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
    title: 'Project Read',
    description: '读取 canonical project graph、resource 内容和派生索引。',
    host: 'browser',
    scope: 'project',
    approvalStrategy: 'auto',
    prompt: '允许扩展读取当前项目中的 flow、session、config 和 state 数据。',
  },
  'project.write': {
    id: 'project.write',
    title: 'Project Write',
    description: '写入 canonical project resource，并进入统一 transaction 链。',
    host: 'browser',
    scope: 'project',
    approvalStrategy: 'prompt',
    prompt: '允许扩展修改项目资源并通过 transaction 落盘。',
  },
  'engine.execute': {
    id: 'engine.execute',
    title: 'Engine Execute',
    description: '创建、推进和取消 managed runs。',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'prompt',
    prompt: '允许扩展调用 Engine 执行 flow 或 session run。',
  },
  'engine.debug': {
    id: 'engine.debug',
    title: 'Engine Debug',
    description: '访问更强的调试与运行控制接口。',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'prompt',
    prompt: '允许扩展访问调试控制、trace 对照和更强的 run 能力。',
  },
  'trace.read': {
    id: 'trace.read',
    title: 'Trace Read',
    description: '读取 run trace、state summary 和 recent events。',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'auto',
    prompt: '允许扩展读取当前项目的 run trace 与 state summary。',
  },
  'network.fetch': {
    id: 'network.fetch',
    title: 'Network Fetch',
    description: '访问外部网络资源。',
    host: 'workspace',
    scope: 'user',
    approvalStrategy: 'prompt',
    prompt: '允许扩展向外部网络发起请求。',
  },
  'process.exec': {
    id: 'process.exec',
    title: 'Process Exec',
    description: '执行本地进程或 shell 命令。',
    host: 'workspace',
    scope: 'user',
    approvalStrategy: 'admin',
    prompt: '允许扩展执行本地进程或 shell 命令。',
  },
  'package.install': {
    id: 'package.install',
    title: 'Package Install',
    description: '安装 template pack 或 studio extension。',
    host: 'workspace',
    scope: 'org',
    approvalStrategy: 'admin',
    prompt: '允许扩展安装包或模板。',
  },
  'package.publish': {
    id: 'package.publish',
    title: 'Package Publish',
    description: '发布 template pack 或 studio extension。',
    host: 'workspace',
    scope: 'org',
    approvalStrategy: 'admin',
    prompt: '允许扩展发布包到团队分发路径。',
  },
  'comment.write': {
    id: 'comment.write',
    title: 'Comment Write',
    description: '写入 comments 或 review annotations。',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'prompt',
    prompt: '允许扩展写入评论和审查批注。',
  },
  'review.accept': {
    id: 'review.accept',
    title: 'Review Accept',
    description: '接受 review proposal 并应用变更。',
    host: 'service',
    scope: 'project',
    approvalStrategy: 'admin',
    prompt: '允许扩展接受 proposal 并应用审查结论。',
  },
  'ai.invoke': {
    id: 'ai.invoke',
    title: 'AI Invoke',
    description: '调用 AI 辅助能力。',
    host: 'service',
    scope: 'user',
    approvalStrategy: 'prompt',
    prompt: '允许扩展调用 AI 能力来分析或生成内容。',
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
    title: 'Flow Editor',
    description: '官方发布的核心扩展，负责 Flow 资源的图形化编辑与执行入口。',
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
          title: 'Flow 编辑',
          shortTitle: 'Flow',
          description: '查看、调整并执行项目内的 Flow 资源。',
          icon: LayoutDashboard,
          component: Flow,
        },
      ],
    },
  },
  {
    id: 'kal.session-editor',
    title: 'Session Editor',
    description: '官方发布的核心扩展，负责 Session 节奏、跳转与 managed run 入口。',
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
          title: 'Session 编辑',
          shortTitle: 'Session',
          description: '编辑 Session 节奏、跳转与 managed run 入口。',
          icon: Route,
          component: SessionEditor,
        },
      ],
    },
  },
  {
    id: 'kal.state-editor',
    title: 'State Editor',
    description: '官方工作流扩展，消费 canonical state 快照并提供调试辅助视图。',
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
          title: 'State 视图',
          shortTitle: 'State',
          description: '查看 Engine 返回的 canonical state 快照。',
          icon: Database,
          component: StateManager,
        },
      ],
      inspectors: [
        {
          id: 'kal.state.inspector',
          extensionId: 'kal.state-editor',
          title: 'State Inspector',
          description: '右侧 inspector slot 中的 state 摘要卡片。',
          component: StateInspectorCard,
          slot: 'right',
          presets: ['authoring', 'debug', 'review'],
        },
      ],
    },
  },
  {
    id: 'kal.config-editor',
    title: 'Config Editor',
    description: '官方工作流扩展，承载项目配置与运行时设置的编辑入口。',
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
          title: 'Config 视图',
          shortTitle: 'Config',
          description: '查看项目配置与运行时设置。',
          icon: Settings,
          component: ConfigEditor,
        },
      ],
    },
  },
  {
    id: 'kal.problems',
    title: 'Problems',
    description: '官方工作流扩展，承载问题列表与未来的 diagnostics 查询入口。',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.problems', 'onEvent:diagnostics.updated'],
    capabilities: [{ capability: 'project.read' }],
    contributes: {
      views: [
        {
          id: 'kal.problems',
          extensionId: 'kal.problems',
          title: '问题',
          shortTitle: 'Problems',
          description: '查看 Kernel 与 Engine 暴露的问题条目。',
          icon: CircleAlert,
          component: ProblemsView,
        },
      ],
      panels: [
        {
          id: 'kal.problems.panel',
          extensionId: 'kal.problems',
          title: 'Problems Panel',
          description: '底部 panel slot 中的 diagnostics 摘要。',
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
    title: 'Prompt Preview',
    description: '官方工作流扩展，承载 prompt 预览与 prompt-like 配置查询。',
    kind: 'official-workflow',
    host: 'browser',
    activationEvents: ['onView:kal.prompt-preview'],
    capabilities: [{ capability: 'project.read' }],
    contributes: {
      views: [
        {
          id: 'kal.prompt-preview',
          extensionId: 'kal.prompt-preview',
          title: 'Prompt 预览',
          shortTitle: 'Prompts',
          description: '预览 Session prompts 与 Flow 中的 prompt-like 配置。',
          icon: MessageSquareQuote,
          component: PromptPreviewView,
        },
      ],
    },
  },
  {
    id: 'kal.debugger',
    title: 'Debugger',
    description: '官方工作流扩展，消费 managed run 与调试状态快照。',
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
          title: '调试器',
          shortTitle: 'Debugger',
          description: '查看当前 managed runs 与调试状态。',
          icon: Bug,
          component: DebuggerView,
        },
      ],
      debugViews: [
        {
          id: 'kal.debugger.summary',
          extensionId: 'kal.debugger',
          title: 'Debug Summary',
          description: '右侧 debug view slot 中的 managed run 摘要。',
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
          title: 'Trace Panel',
          description: '底部 panel slot 中的 selected run timeline。',
          component: TracePanel,
          slot: 'down',
          presets: ['debug', 'review'],
          order: 15,
        },
        {
          id: 'kal.debugger.state-diff-panel',
          extensionId: 'kal.debugger',
          title: 'State Diff Panel',
          description: '底部 panel slot 中的 selected run state diff。',
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
    title: 'H5 Preview',
    description: '官方工作流扩展，承载浏览器内的项目/active run 预览。',
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
          title: 'H5 预览',
          shortTitle: 'Preview',
          description: '查看基于当前项目与 active run 生成的浏览器预览。',
          icon: MonitorPlay,
          component: H5PreviewView,
        },
      ],
    },
  },
  {
    id: 'kal.comments',
    title: 'Comments',
    description: '官方工作流扩展，承载异步评论线程与 review coordination。',
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
          title: '评论',
          shortTitle: 'Comments',
          description: '查看 proposal/resource/run 上的评论线程。',
          icon: MessageSquareMore,
          component: CommentsView,
        },
      ],
      panels: [
        {
          id: 'kal.comments.panel',
          extensionId: 'kal.comments',
          title: 'Comments Panel',
          description: '底部 panel slot 中的评论线程摘要。',
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
    title: 'Review',
    description: '官方工作流扩展，承载 proposal bundle、验证计划与接受/回滚流程。',
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
          title: '审查',
          shortTitle: 'Review',
          description: '查看 proposal bundle、验证结果与接受/回滚操作。',
          icon: ClipboardCheck,
          component: ReviewView,
        },
      ],
      panels: [
        {
          id: 'kal.review.history-panel',
          extensionId: 'kal.review',
          title: 'Review History',
          description: '底部 panel slot 中的 proposal history。',
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
    title: 'Version Control',
    description: '官方工作流扩展，承载资源版本、事务历史、checkpoint 与恢复入口。',
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
          title: '版本控制',
          shortTitle: 'History',
          description: '查看资源版本、事务日志与 checkpoint。',
          icon: History,
          component: VersionControlView,
        },
      ],
      panels: [
        {
          id: 'kal.version-control.panel',
          extensionId: 'kal.version-control',
          title: 'History Panel',
          description: '底部 panel slot 中的 transaction/checkpoint 摘要。',
          component: VersionControlPanel,
          slot: 'down',
          presets: ['history'],
          order: 20,
        },
      ],
    },
  },
  {
    id: 'kal.event-log',
    title: 'Event Log',
    description: '官方工作流扩展，消费 Kernel event stream 与 long-running job progress。',
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
          title: 'Event Log',
          description: '底部 panel slot 中的 Kernel 事件流与任务进度。',
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
    title: 'Package Manager',
    description: '官方工作流扩展，管理项目本地安装的包、模板和扩展。',
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
          title: '包管理',
          shortTitle: 'Packages',
          description: '查看和管理项目本地安装的包。',
          icon: Package,
          component: PackageManagerView,
          presets: ['package'],
        },
      ],
    },
  },
  {
    id: 'kal.template-browser',
    title: 'Template Browser',
    description: '官方工作流扩展，浏览和预览已安装包中的模板。',
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
          title: '模板浏览',
          shortTitle: 'Templates',
          description: '浏览项目本地和已安装包中的模板。',
          icon: LayoutTemplate,
          component: TemplateBrowserView,
          presets: ['package'],
        },
      ],
    },
  },
  {
    id: 'kal.collaborators',
    title: 'Collaborators',
    description: '官方工作流扩展，展示当前项目的在线协作者与活动状态。',
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
          title: 'Collaborators',
          description: '底部 panel slot 中的协作者在线状态。',
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
    title: 'Terminal',
    description: '官方工作流扩展，提供轻量命令执行器，支持 lint/smoke 等 kal 子命令。',
    kind: 'official-workflow',
    host: 'workspace',
    activationEvents: ['onView:kal.terminal'],
    capabilities: [
      { capability: 'project.read' },
      { capability: 'process.exec', required: false, restrictedMode: 'degrade' },
    ],
    contributes: {
      views: [
        {
          id: 'kal.terminal',
          extensionId: 'kal.terminal',
          title: '终端',
          shortTitle: 'Terminal',
          description: '执行 kal 子命令（lint, smoke 等）。',
          icon: Terminal,
          component: TerminalView,
        },
      ],
    },
  },
  {
    id: 'kal.vercel-deploy',
    title: 'Vercel Deploy',
    description: '官方工作流扩展，提供 Vercel 部署触发与状态查看（初始为 stub）。',
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
          title: '部署',
          shortTitle: 'Deploy',
          description: '触发 Vercel 部署并查看部署状态。',
          icon: Rocket,
          component: DeployView,
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
    return { ok: false, reason: `当前不允许动态注册 ${input.kind} 类型的扩展` };
  }

  const existing = [...OFFICIAL_STUDIO_EXTENSIONS, ...dynamicExtensions].find((e) => e.id === input.id);
  if (existing) {
    return { ok: false, reason: `扩展 ${input.id} 已注册` };
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
