# TODO

## 已完成

- [x] README 英文默认 + 中文版独立
- [x] 版本号统一、移除未验证性能指标
- [x] 文档链接修正（docs_v5 → docs）
- [x] `kal init` 项目脚手架（`--template minimal|game`）
- [x] `kal debug` 可恢复调试（`--start/--continue/--step/--state/--list/--delete/--retry/--skip`，`--format agent`）
- [x] `kal lint` 项目级静态分析（session 校验、unused flow、state key 检查、deep node validation）
- [x] `kal smoke` 最小自动化 smoke test
- [x] `kal eval` prompt 评估工具链（nodes/render/run/compare）
- [x] `kal schema` 导出 node 和 session schema
- [x] `kal config` 配置管理（含 API 密钥加密存储）
- [x] `kal studio` 集成 editor 的一体化服务
- [x] ApplyState → WriteState 全局改名同步
- [x] LLM trace hooks 基础设施（`--verbose` 输出 llm_traces）
- [x] 清理 internal 文档（删除 v1-v4 重复文档、敏感商业文件、合并 docs_v5）
- [x] 补齐 cli.md 缺失命令（studio/init/eval/schema）
- [x] 修正 concepts.md 和 README.md 中的节点数量
  已完成：concepts.md、nodes.md、README.md、README.zh-CN.md、getting-started.md 均已修正为 17。
- [x] getting-started.md 命令路径更新为 `kal` CLI
- [x] engine 核心测试（cli.test.ts、runtime.test.ts、server.test.ts、run-manager.test.ts）

## 3/21 前完成

状态说明：`[ ]` 未完成；`[~]` 进行中 / 基础版已落地但尚未达到目标定义；`[x]` 已完成。

### Studio / 编辑器

- [~] 可视化 Debug：画布节点已展示执行状态高亮（当前 step 蓝色脉冲、等待输入绿色呼吸、已访问灰色、断点红点）；待把 Smoke 回放集成为 Debug 的 "Run All" 模式
  现状：`DebuggerView` 已能创建 managed run、选择 run、查看状态快照 / timeline / state diff / 输入历史，并对当前 step 做断点、单步、继续和重放操作。A 线新增 `use-node-overlay.ts` 派生 hook，将运行态和断点注入 ReactFlow nodes，画布节点已可显示当前 step、等待输入、已访问与断点状态，但“Run All / Smoke 回放”仍未并入 Debug 工作流。
- [x] Lint 内联诊断：画布节点已根据 diagnostics 实时标红/标黄，右上角显示诊断数量 badge
  现状：Engine 端 `buildCliDiagnostic()` 已扩展支持 `flowId`/`nodeId`/`stepId`/`phase` 字段，`DiagnosticPayload` 新增 `severity: 'error' | 'warning' | 'info'`。A 线 `useSessionNodeOverlay` / `useFlowNodeOverlay` 已按 `stepId` 或 `flowId + nodeId` 聚合诊断，并通过 `NodeOverlayBadge` 渲染诊断标记。
- [~] Prompt 预览面板：已有全局搜索、画布选中联动与自动定位；待实现选中 PromptBuild 节点时的最终 prompt 渲染，以及 fragment 激活状态和条件命中展示
  现状：`PromptPreviewView` 已支持 search、画布选中后的自动置顶、ring 高亮与滚动定位，并显示“已联动”提示；当前仍停留在 prompt-like 文本与 bindings 预览，没有做到最终 prompt/rendered fragments 级别。
- [~] 自定义节点显示：Flow 已基于 `nodeManifests` 渲染节点与菜单；待继续验证 editor 全链路体验，补齐自定义节点的配置编辑与展示细节
  现状：`ManifestNode` 已补 category 图标、handle 类型标签与 Inspector 选中节点信息卡片。当前仍需继续验证不同 schema、配置编辑和 inspector 侧的兼容性。
- [~] Config 视图编辑能力：B 线写入链已完成，A 线已切到可编辑表单；待把保存按钮真正接到 `updateConfig()`
  现状：Engine `saveConfig()` → `PUT /api/config` → `engineApi.saveConfig()` → `studioStore.updateConfig()` → `useStudioCommands().updateConfig()` 已打通。`ConfigEditor` 已改为完整的可编辑表单，支持 draft/撤销，但保存按钮仍是 disabled 占位。安全限制：`llm.apiKey`/`llm.baseUrl` 不可通过此接口修改。
- [~] 节点配置面板优化：array 类型配置已提供结构化列表编辑，object/高频复杂 schema 仍待继续表单化
  现状：`ManifestNode` 的 `JsonField` 对 array 类型默认提供结构化列表编辑，支持 Code/List 模式切换。B 线已完成内置节点 `configSchema` 审计，PromptBuild 的 `fragments` 和 WriteState 的 `allowedKeys`/`operations` 仍是优先级最高的表单化目标。
- [~] 自动布局：Flow / Session 已接入 DAG 自动布局与手动 Auto Layout，并新增 barycenter 排序减少边交叉；待覆盖 AI 或手写 flow JSON 时的默认布局与更多细节场景
  现状：`layoutDag` 已用于 Flow / Session 的位置计算，进入画布时会尝试自动补位；A 线又增加了 forward/backward 两轮 barycenter 排序，但复杂图场景和默认布局策略仍待继续打磨。

### Studio 排版与视觉设计

- [x] 字体系统：已引入 Inter + JetBrains Mono，中文 fallback PingFang SC / Noto Sans SC
  现状：`index.html` 通过 Google Fonts CDN 引入 Inter（UI 正文）和 JetBrains Mono（等宽），`index.css` 在 `@theme inline` 中声明 `--font-sans` 和 `--font-mono` 变量，Tailwind 自动应用到 `font-sans` / `font-mono` 工具类。
- [x] Tab Bar 层级重构：操作按钮已改为 icon-only，与视图标签视觉分离
  现状：`App.tsx` 的 Tab Bar 操作按钮（Palette / Diagnostics / Run）从 `variant="outline" size="sm"` 带文字改为 `variant="ghost" size="icon-sm"` 纯图标按钮，加 `title` tooltip。Trusted/Restricted 状态保留为紧凑 badge。视图标签区与操作区视觉权重明确分离。
- [x] Sidebar 信息精简：扩展状态标签仅在 debug preset 下显示，active 状态用绿色区分
  现状：`AppSidebar.tsx` 的 `renderExtensionGroup` 根据 `activePreset === 'debug'` 条件渲染 runtime status 标签，非 debug 模式下不再显示 ACTIVE/REGISTERED 等内部状态。active 状态用绿色文字区分。tooltip 也移除了 runtime status 后缀。
- [x] Inspector 信息精简：扩展调试详情已折叠到 CollapsibleSection，顶层只保留 ID、状态和 capability chips
  现状：`WorkbenchInspector` 新增 `CollapsibleSection` 组件，将宿主/分类/Blocked/Degraded/最近激活/capability 元数据/activation events 折叠到"扩展详情"可展开区域。顶层只展示扩展 ID、运行时状态和 capability chips。操作按钮改为并排紧凑布局。后续可继续根据当前视图展示更强的上下文内容（如选中节点属性等）。
- [x] 节点卡片宽度自适应：根据 configSchema 字段数量动态选择宽度档位
  现状：`ManifestNode` 根据 `configSchema.properties` 数量自动选择宽度：≤1 字段 `w-64`，2-3 字段 `w-80`，≥4 字段 `w-96`。
- [x] 底部面板折叠/展开：WorkbenchPanels 已支持折叠/展开 toggle，显示面板数量
  现状：`WorkbenchPanels` 新增折叠 toggle 按钮，显示"面板 (N)"标题，点击展开/收起面板内容区域。后续可继续扩展拖拽调高和面板标签切换。
- [x] 空状态组件统一：新建 `EmptyState` 组件，已替换 18 个组件中约 25 处空状态
  现状：新建 `src/components/EmptyState.tsx`，支持 icon + message + description + action + compact 模式。已替换 DebuggerView、PromptPreviewView、VersionControlView、ReviewView、CommentsView、CommandPalette、ProblemsView、PackageManagerView、TemplateBrowserView、SessionRunDialog 以及所有 Panel 组件中的 `border-dashed` 空状态 div。
- [x] 官方视图体验改进：DeployView、H5PreviewView、TerminalView、DebuggerSummaryView 四个视图已完成体验优化
  现状：DeployView 用 EmptyState 替换配置说明区域，增加部署状态图标（Loader/CheckCircle/XCircle）；H5PreviewView 增加加载状态、错误处理、设备尺寸切换（手机/平板/桌面）；TerminalView 增加命令历史（上下箭头）、清屏按钮、输出着色；DebuggerSummaryView 用 EmptyState 替换空状态，改进 run 卡片视觉（状态图标、active ring 高亮）。
- [x] 响应式 Inspector 降级：xl 以下通过 Sheet 抽屉提供 Inspector
  现状：`App.tsx` 在 xl 以下显示一个固定在右下角的 Info 按钮，点击打开 Sheet 抽屉渲染 `WorkbenchInspector`。`WorkbenchInspector` 新增 `mobile` prop，传入时移除 `hidden xl:flex` 限制，直接渲染为 flex 列。
- [x] ExtensionSurface 无限循环 bug 修复
  现状：已修复。原因是 `ExtensionSurface.tsx` 的 `useEffect` guard 比较 `activationReason` 字符串，当同一 extension 有多个 surface（main view + inspector）时，两个实例争抢 `activationReason` 字段导致无限 re-render（React error #185）。修复方式：guard 只检查 `runtime.activated` 布尔值，不再比较 `activationReason`。

### 架构 / 基础设施

- [x] Studio Extensions 插件接口：registry、capability、activation events、动态注册基础设施已完成，动态扩展已穿透到 UI
  已完成：`useWorkbench()` 已改为消费 `getAllViews()` / `getAllExtensions()`，`getStudioView()` / `getStudioExtension()` / `getStudioExtensionsByKind()` 均已搜索动态注册的扩展。`node-pack` / `template-pack` 贡献的 views/panels 现在能穿透到 sidebar 和 workbench。`studio-extension` kind 暂不开放（保持安全限制）。
- [x] Capability Gate 后端收口：把 capability 授权上下文传到 Engine，并由服务端执行真正的权限边界
  已完成：Studio `engine-client.ts` 的 `request()` 通过 `setCapabilityProvider()` 注入 `X-Studio-Capabilities` header，`studioStore` 初始化时注册 provider。Engine `server.ts` 新增 `parseCapabilities()` / `requireCapability()` 辅助函数，对敏感端点（`PUT /api/config`、`PUT/DELETE /api/flows/*`、`PUT/DELETE /api/session`、`POST /api/terminal/exec`、`POST /api/executions`、`POST /api/runs`、`POST /api/tools/deploy`）执行 capability 检查。无 header 的请求（CLI/curl）放行，仅对 Studio 会话强制执行。
- [~] H5 预览插件（官方内置）：Studio 内嵌 H5 预览面板已落地；待在预览中实现 UI 绑定（SignalIn/SignalOut 与前端元素的可视化关联）
  现状：`H5PreviewView` 已支持 iframe 加载、刷新、新窗口打开、加载状态指示器、错误处理和重试、设备尺寸切换（手机 375px / 平板 768px / 桌面 100%）。当前仍没有交互式 UI 绑定能力。
- [~] 终端插件（官方内置）：已有轻量命令执行器和更完整的后端白名单；待升级为类似 VS Code 的 integrated terminal
  现状：`TerminalView` 已支持命令历史（上下箭头浏览）、清屏按钮、输出着色。Engine 端 `/api/terminal/exec` 白名单已扩展到 7 个命令（lint、smoke、schema、debug-list、debug-state、config、eval），但前端终端交互仍是轻量命令面板。
- [~] Vercel 部署插件（官方内置）：视图与 API stub 已落地；待接入真实打包部署、部署状态监控和日志查看
  现状：`DeployView` 已用 EmptyState 替换配置说明区域，增加部署状态图标（Loader2 旋转 / CheckCircle2 成功 / XCircle 失败），按钮在部署中显示 spinner。Engine 端 `/api/tools/deploy` 目前返回 `DEPLOY_NOT_CONFIGURED`。
- [ ] UI 绑定方案：定义 SignalIn/SignalOut 作为 UI 绑定契约的规范，H5 预览插件作为首个落地场景
  下一步：先确定最小契约，包括元素选取方式、SignalIn/SignalOut 命名规则、事件映射和数据回传格式，再让 H5 预览基于这套契约做第一版可视化绑定。
- [x] 版本控制语义覆盖：`RestorableSnapshot` 已包含 `config` 和 `state`，checkpoint/restore/undo/redo/diff 全链路覆盖
  已完成：`RestorableSnapshot` 新增 `config?` 和 `state?` 字段（optional 保持向后兼容）。`captureRestorableSnapshot()` 同时捕获 config 和 state。`restoreCheckpoint` 恢复时调用 `engineApi.saveConfig()`。`compareSnapshot()` 已替换 `configChanged: false, stateChanged: false` 硬编码为真实 JSON 比较。
- [x] State 变更日志：`DebugRunSnapshot` 新增 `stateChangeLog`，run/debug advance 自动累积每步 state 变更
  已完成：新增 `StateChangeLogEntry` 类型（`stepId`/`stepIndex`/`key`/`before`/`after`/`timestamp`）。`DebugRunSnapshot.stateChangeLog` 在 `RunManager.advanceRun()` 和 `debug.ts advanceMultiStep()` 中自动累积。`DebugStatePayload` 新增 `stateChangeLog?` 字段，`--state` 命令输出包含完整变更日志。
- [x] State 约束声明：`initial_state.json` 已支持 `min`/`max`/`enum` 约束
  现状：`StateValue` 类型、`StateStore.loadInitialState()`、相关测试和参考文档都已覆盖；当前运行时策略为 number clamp、string enum fallback。若后续要改成严格拒绝/告警，应单独列为“约束策略可配置”任务。
- [x] `kal debug --state` 输出可读的状态快照；已支持 `--diff --run-id <a> --diff-run <b>` 对比两个快照
  已完成：CLI 已支持 `--state`、`--run-id|--latest` 和 `--format pretty|json|agent`。新增 `--diff` 动作，加载两个 snapshot 逐 key 比较 stateSnapshot，输出 added/removed/changed keys。

### Devkit / 工具链

- [x] Eval 跨模型对比：`kal eval run` 新增 `--model <name>` 参数，支持同一 prompt 跑不同模型并对比结果
  已完成：`EvalRunOptions` 新增 `modelOverride`，运行期间临时替换 `config.llm.defaultModel`，运行结束后恢复。`EvalRunResult` 新增 `model` 字段。CLI 解析 `--model` flag 并传入。
- [~] Lint 增强：severity/location、类型检查、enum 校验、空 flow / 孤立节点检测均已落地；待继续审计过于宽泛的 `configSchema` type 定义
  现状：`DiagnosticPayload` 已新增 `severity` 字段，lint summary 和 pretty renderer 基于 severity 展示。`validateNodeConfig` 已新增 `CONFIG_TYPE_MISMATCH` 与 `CONFIG_INVALID_ENUM`，并补充 `flowId`/`nodeId`/`phase` 定位信息。另已新增 `ORPHAN_NODE`、`EMPTY_FLOW`，`UNUSED_FLOW` 也会扫描 SubFlow 引用。
- [x] CI 配置：GitHub Actions 已接通 core/engine build + typecheck + test，并覆盖 studio build
  已完成：`.github/workflows/ci.yml` 已创建，push main / PR 触发，使用 pnpm 9 + Bun + Node，在 CI 中执行安装、core build、core/engine typecheck、studio build、engine build 以及 core/engine tests。

### 内容 / 示例

- [ ] Showcase 游戏：选定类型（候选：AI 狼人杀、AI 侦探推理、AI 角色养成、AI TTRPG 单人冒险），完成设计文档，实现 15-30 分钟可玩时长，playtest 至少 10 轮
  下一步：先在四个候选里收敛到一个最适合当前引擎能力的题材，再拆成设计文档、核心 loop、内容实现、playtest 四个阶段推进。
- [x] 简化 dnd-adventure：减少冗余 flow，合并重复的状态处理逻辑
  已完成：合并 `outro-death` + `outro-win` 为单一 `outro.json`（减少 2 个 flow 文件、10 个节点）。清理 Message 节点冗余 config。lint 零警告通过。剩余 intro/start-adventure/display-character 三个 2 节点静态 flow 已是最小结构，进一步合并收益有限，视为完成。
- [~] 确保示例项目能用 `kal lint` 零警告通过
  现状：`dnd-adventure` 已零诊断通过，修复项包括移除 Message 节点 config 中冗余 `system`/`user`/`context` 字段，以及修复 `UNUSED_FLOW` 对 SubFlow 的误报。其他示例仍需逐个复核并固化到 CI/脚本里。

### 文档

- [ ] 文档 / Skills 规范性写作：统一格式与内容，确保一致性和可维护性
  下一步：先定义统一模板和最小字段集，再逐篇迁移，避免一边写新文档一边继续引入新格式。
- [x] 写 "Design Patterns" 文档：常见游戏模式的 KAL 实现方式（回合制循环、分支叙事、角色创建、物品系统、对话历史管理）
  已完成：已补齐 Design Patterns 文档，覆盖回合循环、分支叙事、角色创建、物品/库存、历史管理与 SubFlow 组合等常见模式，并给出示例引用。
- [x] 写 "Troubleshooting" 文档：常见错误和解决方法
  已完成：已补齐 Troubleshooting 文档，覆盖 Lint、Debug、Studio 连接、Custom Nodes 和 LLM/API 常见问题。
- [x] 写 "Custom Nodes Guide"：从零创建自定义节点的完整教程
  已完成：已补齐 Custom Nodes Guide，包含最小示例、接口说明、configSchema、ExecutionContext、Studio 集成与常见坑。

### 社区 / 发布

- [~] npm 发布 `@kal-ai/core` 和 `@kal-ai/engine`
  已完成准备工作：三个包（`@kal-ai/core`、`@kal-ai/engine`、`create-kal-game`）均已配置 `publishConfig.access`、`exports` map、`files` 字段、`prepublishOnly` 脚本、per-package README。`pnpm pack --dry-run` 验证通过。Changesets 已配置（`access: "public"`）。
  待执行：确认版本号策略（是否从 0.1.0 开始），执行 `pnpm changeset` 创建首个 changeset，然后 `pnpm release`。
- [x] CONTRIBUTING.md：如何贡献代码、如何提 issue、代码规范
  已完成：覆盖 Prerequisites、Getting Started、Project Structure、Common Commands、Development Workflow、Commit Conventions、Code Style、Adding Built-in Nodes、Example Projects lint 要求、Reporting Issues。

## 之后

- [x] `npx create-kal-game` 脚手架
  已完成：`packages/create-kal-game/bin.mjs` 已实现，支持 `--template minimal|game`，`package.json` 已配置 `bin` 和 `files` 字段。
  已优化：共享模板定义已抽取到 `apps/engine/src/scaffold-templates.ts`，`kal init` 消费该模块，`create-kal-game` 保持独立但模板内容已同步（含完整 engine/retry/cache config、minimal 模板补 initial_state.json）。
- [ ] 在线 Playground
  阻塞：依赖更稳定的浏览器侧运行方案、示例资产裁剪和安全边界设计，否则很容易先做出难维护的 demo。
- [ ] `kal generate` 从自然语言生成 flow JSON
  下一步：先限定输入输出范围，例如只生成单个 flow 或骨架 session，再逐步扩展到多资源联动和自动修复。
