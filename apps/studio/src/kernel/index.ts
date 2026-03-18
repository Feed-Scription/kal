/**
 * Kernel Public API
 *
 * 扩展和组件只应通过此入口消费 Kernel 能力。
 * 禁止直接引用 `@/store/studioStore` — 该模块为 Kernel 私有实现。
 */

// ── React Hooks（数据面 + 命令面）──
export {
  useWorkbench,
  useStudioResources,
  useFlowResource,
  usePromptPreview,
  useConnectionState,
  useSaveState,
  useVersionControl,
  useGitStatus,
  useExtensionRuntime,
  useExtensionRuntimeMap,
  useKernelEvents,
  useKernelJobs,
  useDiagnostics,
  useRunDebug,
  useResourceVersion,
  useCapabilityGate,
  usePanelContributions,
  useInspectorContributions,
  useDebugViewContributions,
  useWorkbenchContext,
  useStudioCommands,
  useRunService,
  useReferences,
  useSearch,
} from './hooks';

// ── Kernel 类型定义 ──
export type * from './types';

// ── Service 接口定义 ──
export type * from './services/types';

// ── Registry（视图/扩展注册表）──
export {
  OFFICIAL_STUDIO_EXTENSIONS,
  DEFAULT_STUDIO_VIEW_ID,
  STUDIO_VIEWS,
  STUDIO_PANELS,
  STUDIO_INSPECTORS,
  STUDIO_DEBUG_VIEWS,
  getStudioView,
  getStudioExtension,
  getStudioExtensionForView,
  getStudioExtensionsByKind,
  getStudioPanels,
  getStudioInspectors,
  getStudioDebugViews,
  getStudioCapabilityCatalog,
} from './registry';

// ── Non-React Service ──
export { runService } from './services/run-service';
