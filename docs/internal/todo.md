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
  已完成：concepts.md、nodes.md、README.md、README.zh-CN.md 均已修正为 17。
- [x] getting-started.md 命令路径更新为 `kal` CLI
- [x] engine 核心测试（cli.test.ts、runtime.test.ts、server.test.ts、run-manager.test.ts）

## 3/21 前完成

状态说明：`[ ]` 未完成；`[~]` 进行中 / 基础版已落地但尚未达到目标定义；`[x]` 已完成。

### Studio / 编辑器

- [~] 可视化 Debug：已有 Debugger 视图、run 列表、断点、单步、继续、重放；待在画布中展示执行状态（节点高亮等），并把 Smoke 回放集成为 Debug 的 "Run All" 模式
  现状：`DebuggerView` 已能创建 managed run、选择 run、查看状态快照 / timeline / state diff / 输入历史，并对当前 step 做断点、单步、继续和重放操作。
- [~] Lint 内联诊断：已有 Problems 视图、diagnostics 刷新和事件链；待在画布节点上实时标红/标黄显示 lint 问题（缺连线、config 错误、未使用 flow 等）
  现状：Engine 端 `buildCliDiagnostic()` 已扩展支持 `flowId`/`nodeId`/`stepId`/`phase` 字段，lint 所有诊断均已填充定位信息。`DiagnosticPayload` 新增 `severity: 'error' | 'warning' | 'info'` 字段，A 线可据此决定标红或标黄。Studio `DiagnosticPayload` 类型已对齐（`severity?` optional 保持向后兼容）。A 线可直接用 `flowId + nodeId + severity` 在画布节点上定位并标红/标黄。
- [~] Prompt 预览面板：已有 Prompt Preview 视图与 prompt-like 配置检索；待实现选中 PromptBuild 节点时的最终 prompt 渲染，以及 fragment 激活状态和条件命中展示
  现状：当前可从 Session step 与 Flow 节点配置中提取 prompt-like 文本与 bindings，支持全局搜索和预览；还没有做到“随选中节点实时联动”的精细化预览。
- [~] 自定义节点显示：Flow 已基于 `nodeManifests` 渲染节点与菜单；待继续验证 editor 全链路体验，补齐自定义节点的配置编辑与展示细节
  现状：Engine 已把项目的 `nodeManifests` 暴露给 Studio，Flow 画布和右键菜单会按 manifest 渲染节点；当前仍需继续验证不同 schema、配置编辑和 inspector 侧的兼容性。
- [~] Config 视图编辑能力：B 线写入链已完成；待 A 线在 ConfigEditor 中接入保存按钮
  B 线已完成：Engine `saveConfig()` → `PUT /api/config` → `engineApi.saveConfig()` → `studioStore.updateConfig()` → `useStudioCommands().updateConfig()`。安全限制：`llm.apiKey`/`llm.baseUrl` 不可通过此接口修改（防止 env var 引用被覆盖为明文）。保存后自动 diagnostics refresh + version bump + undo 支持。
  A 线待接：在 ConfigEditor 中调用 `updateConfig(patch)` 并移除"只读模式"提示。
- [ ] 节点配置面板优化：当 configSchema type 为 object/array 时，提供更友好的编辑 UI，替代原始 JSON textarea
  B 线已完成审计：17 个内置节点中，PromptBuild（`fragments` array of objects）和 WriteState（`operations`/`constraints`/`deduplicateBy` nested objects + `allowedKeys` array）是最需要表单化编辑器的两个节点。其次是 ComputeState（`operand` 可为 object）、PostProcess（`processors` array）、GenerateText（`historyPolicy` nested object）。其余节点的 configSchema 均为简单 string/number/boolean/enum 字段，现有 JSON textarea 已够用。
  A 线下一步：优先为 PromptBuild 的 `fragments` 和 WriteState 的 `allowedKeys`/`operations` 提供表单化编辑器。
- [~] 自动布局：Flow / Session 已接入 DAG 自动布局与手动 Auto Layout；待覆盖 AI 或手写 flow JSON 时的默认布局与更多细节场景
  现状：`layoutDag` 已用于 Flow / Session 的位置计算，Flow 进入画布时会尝试自动补位，工具栏也提供手动 Auto Layout；但仍缺少更稳的默认布局策略和复杂图场景打磨。

### Studio 排版与视觉设计

- [ ] 字体系统：引入自定义字体栈，替代浏览器默认 system-ui
  现状：`index.css` 未声明任何 `font-family`，完全依赖浏览器默认字体。代码/monospace 场景（节点 ID、state key、JSON）没有指定专用等宽字体，中文字体无 fallback 声明。
  下一步：引入 `JetBrains Mono`（monospace）+ `Geist` 或 `DM Sans`（UI 正文），中文 fallback 到 `"PingFang SC", "Noto Sans SC"`。在 `index.css` 中声明 `--font-sans` / `--font-mono` 变量并全局应用。
- [ ] Tab Bar 层级重构：分离视图标签与操作按钮
  现状：`App.tsx` 的 Tab Bar 把视图标签（Flow / Session / State）和操作按钮（Palette / Diagnostics / Run / Trusted）放在同一行，视觉权重相同，用户难以快速区分导航与操作。多视图时左侧标签 `overflow-x-auto` 但无滚动指示器。
  下一步：操作按钮组改为更小的 icon-only 按钮或移到独立 toolbar 区域；视图标签区加滚动渐变遮罩指示溢出。
- [ ] Sidebar 信息精简：按工作区预设过滤扩展列表，隐藏调试状态标签
  现状：Sidebar 同时展示 27 个 `SidebarMenuButton`，每个扩展项显示 `ACTIVE` / `REGISTERED` 状态标签。这些是扩展系统的内部状态，对终端用户无价值。
  下一步：扩展状态标签仅在 `debug` preset 下显示；工作流扩展按当前 preset 过滤，非相关项默认折叠；Flow 资源列表加搜索/过滤。
- [ ] Inspector 内容重构：展示上下文相关信息，扩展调试信息移至专用视图
  现状：`WorkbenchInspector` 几乎全部展示扩展系统内部状态（Extension ID、Capability chips、运行时状态、Activation Events），320px 的宝贵空间被开发调试信息占据，而选中节点属性、flow 统计、state 摘要等用户关心的上下文信息被挤到下方。
  下一步：Inspector 根据当前视图动态展示上下文内容（Flow 视图 → 选中节点属性；Session 视图 → 当前 step 详情；State 视图 → state 统计）。扩展调试信息移到 "Extension DevTools" 专用视图或仅在 debug preset 下展示。
- [ ] 节点卡片宽度自适应：根据 configSchema 字段数量动态调整
  现状：`ManifestNode` 固定 `w-96`（384px），对只有一个 `ref` 字段的 RunFlow 节点太宽，对多 textarea 的 PromptBuild 节点可能不够。
  下一步：提供 compact / expanded 两种模式，或根据 configSchema properties 数量自动选择宽度档位（如 `w-64` / `w-96` / `w-[480px]`）。
- [ ] 底部面板交互增强：支持拖拽调整高度、面板标签切换、折叠/展开
  现状：`WorkbenchPanels` 只有固定 `max-h-72`（288px）的网格，无拖拽调整高度、无面板标签切换、无折叠/展开控制。
  下一步：先加折叠/展开按钮和面板标签切换（最小可用），再考虑拖拽调整高度。
- [ ] 空状态组件统一：各视图空状态处理风格不一致
  现状：StateManager 用简单文字，ProblemsView 有图标+描述+操作按钮，DebuggerView 有详细引导文案。
  下一步：抽取统一的 `EmptyState` 组件（icon + title + description + optional action），各视图复用。
- [ ] 响应式 Inspector 降级：在 xl 以下提供替代方案
  现状：`WorkbenchInspector` 在 `xl`（1280px）以下完全 `hidden`，1024-1279px 窗口宽度下用户完全失去右侧面板，无替代方案。
  下一步：在 lg-xl 区间提供抽屉或浮层模式的 Inspector，通过按钮触发展开。
- [x] ExtensionSurface 无限循环 bug 修复
  现状：已修复。原因是 `ExtensionSurface.tsx` 的 `useEffect` guard 比较 `activationReason` 字符串，当同一 extension 有多个 surface（main view + inspector）时，两个实例争抢 `activationReason` 字段导致无限 re-render（React error #185）。修复方式：guard 只检查 `runtime.activated` 布尔值，不再比较 `activationReason`。

### 架构 / 基础设施

- [x] Studio Extensions 插件接口：registry、capability、activation events、动态注册基础设施已完成，动态扩展已穿透到 UI
  已完成：`useWorkbench()` 已改为消费 `getAllViews()` / `getAllExtensions()`，`getStudioView()` / `getStudioExtension()` / `getStudioExtensionsByKind()` 均已搜索动态注册的扩展。`node-pack` / `template-pack` 贡献的 views/panels 现在能穿透到 sidebar 和 workbench。`studio-extension` kind 暂不开放（保持安全限制）。
- [x] Capability Gate 后端收口：把 capability 授权上下文传到 Engine，并由服务端执行真正的权限边界
  已完成：Studio `engine-client.ts` 的 `request()` 通过 `setCapabilityProvider()` 注入 `X-Studio-Capabilities` header，`studioStore` 初始化时注册 provider。Engine `server.ts` 新增 `parseCapabilities()` / `requireCapability()` 辅助函数，对敏感端点（`PUT /api/config`、`PUT/DELETE /api/flows/*`、`PUT/DELETE /api/session`、`POST /api/terminal/exec`、`POST /api/executions`、`POST /api/runs`、`POST /api/tools/deploy`）执行 capability 检查。无 header 的请求（CLI/curl）放行，仅对 Studio 会话强制执行。
- [~] H5 预览插件（官方内置）：Studio 内嵌 H5 预览面板已落地；待在预览中实现 UI 绑定（SignalIn/SignalOut 与前端元素的可视化关联）
  现状：`H5PreviewView` 已以内嵌 iframe 方式加载 `/api/tools/h5-preview`，支持刷新和新窗口打开，当前主要用于压测 preview surface，还没有交互式绑定能力。
- [~] 终端插件（官方内置）：已有轻量命令执行器，当前支持 `lint` / `smoke` / `schema` / `debug-list` / `debug-state`；待升级为类似 VS Code 的 integrated terminal，可直接执行更多 kal CLI 命令
  现状：Studio 端已有 Terminal 视图和输出面板，Engine 端提供 `/api/terminal/exec`，白名单已扩展到 5 个命令（lint、smoke、schema、debug-list、debug-state）。
- [~] Vercel 部署插件（官方内置）：视图与 API stub 已落地；待接入真实打包部署、部署状态监控和日志查看
  现状：Studio 已有 Deploy 视图和触发按钮，Engine 端 `/api/tools/deploy` 目前返回 `DEPLOY_NOT_CONFIGURED`，说明接口骨架已在，实际部署链路尚未接入。
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
- [x] Lint 增强：`DiagnosticPayload` 新增 `severity` 字段；`validateNodeConfig` 新增 config 类型检查（`CONFIG_TYPE_MISMATCH`）；新增 `ORPHAN_NODE`（无边节点）和 `EMPTY_FLOW`（空流程）规则；`UNUSED_FLOW` 检测现在也扫描 SubFlow 节点引用
  已完成：severity 贯穿 engine 和 studio 两端类型。lint summary 和 pretty renderer 均基于 severity 字段而非硬编码 code 判断。
- [x] CI 配置：GitHub Actions 跑 `bun run typecheck` + `bun run test`
  已完成：`.github/workflows/ci.yml` 已创建，push main / PR 触发，使用 pnpm 9 + Node 18 + Bun，执行 `pnpm install --frozen-lockfile` → `bun run typecheck` → `bun run test`。

### 内容 / 示例

- [ ] Showcase 游戏：选定类型（候选：AI 狼人杀、AI 侦探推理、AI 角色养成、AI TTRPG 单人冒险），完成设计文档，实现 15-30 分钟可玩时长，playtest 至少 10 轮
  下一步：先在四个候选里收敛到一个最适合当前引擎能力的题材，再拆成设计文档、核心 loop、内容实现、playtest 四个阶段推进。
- [x] 简化 dnd-adventure：减少冗余 flow，合并重复的状态处理逻辑
  已完成：合并 `outro-death` + `outro-win` 为单一 `outro.json`（减少 2 个 flow 文件、10 个节点）。清理 Message 节点冗余 config。lint 零警告通过。剩余 intro/start-adventure/display-character 三个 2 节点静态 flow 已是最小结构，进一步合并收益有限，视为完成。
- [x] 确保 dnd-adventure 和 guess-who 都能用 `kal lint` 零警告通过
  已完成（dnd-adventure）：移除 Message 节点 config 中的冗余 `system`/`user`/`context` 字段（这些应通过 edge 传入）；为 outro-death/outro-win 添加 Constant 节点提供 user 输入；修复 `UNUSED_FLOW` 检测逻辑以扫描 SubFlow 节点引用。dnd-adventure 现在零诊断通过。

### 文档

- [ ] 文档 / Skills 规范性写作：统一格式与内容，确保一致性和可维护性
  下一步：先定义统一模板和最小字段集，再逐篇迁移，避免一边写新文档一边继续引入新格式。
- [x] 写 "Design Patterns" 文档：常见游戏模式的 KAL 实现方式（回合制循环、分支叙事、角色创建、物品系统、对话历史管理）
  已完成：`docs/guides/design-patterns.md`，覆盖 Turn-Based Loop、Branching Narrative、Character Creation、Conversation History Management、Item/Inventory System、SubFlow Delegation，均含 JSON 示例和 dnd-adventure 引用。
- [x] 写 "Troubleshooting" 文档：常见错误和解决方法
  已完成：`docs/guides/troubleshooting.md`，覆盖 Lint（UNUSED_FLOW / MISSING_REQUIRED_INPUT / CONFIG_UNKNOWN_FIELD / CONFIG_TYPE_MISMATCH）、Debug（SESSION_HASH_MISMATCH / INPUT_REQUIRED / NO_ACTIVE_RUN）、Studio 连接、Custom Nodes、LLM/API 问题。
- [x] 写 "Custom Nodes Guide"：从零创建自定义节点的完整教程
  已完成：`docs/guides/custom-nodes.md`，含最小示例、Node Structure、Config Schema、Execution Context API、Flow JSON 用法、测试方法、Studio 集成、常见坑。

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
