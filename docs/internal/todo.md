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
  现状：concepts.md、nodes.md、README.md、README.zh-CN.md、getting-started.md 已全部修正为 17。
- [x] getting-started.md 命令路径更新为 `kal` CLI
- [x] engine 核心测试（cli.test.ts、runtime.test.ts、server.test.ts、run-manager.test.ts）

## 3/21 前完成

状态说明：`[ ]` 未完成；`[~]` 进行中 / 基础版已落地但尚未达到目标定义；`[x]` 已完成。

### Studio / 编辑器

- [x] 可视化 Debug（画布执行状态高亮）：画布节点已展示执行状态高亮（当前 step 蓝色脉冲、等待输入绿色呼吸、已访问灰色、断点红点）；待把 Smoke 回放集成为 Debug 的 "Run All" 模式
  现状：新建 `use-node-overlay.ts` 派生 hook，将 `useRunDebug()` 的 `selectedStepId` / `selectedWaitingStepId` / `breakpoints` / `selectedTimeline` 和 `useDiagnostics()` 索引化为 `Map<nodeId, NodeOverlayState>`，由 SessionEditor / Flow 注入到 ReactFlow nodes，7 个节点组件统一消费渲染。CSS 动画在 `index.css` 中通过 `@layer utilities` 注册。
- [x] Lint 内联诊断：画布节点已根据 diagnostics 实时标红/标黄，右上角显示诊断数量 badge
  现状：`useSessionNodeOverlay` 按 `stepId` 聚合诊断，`useFlowNodeOverlay` 按 `flowId + nodeId` 聚合诊断，severity 判断复用 ProblemsView 的 `severityOf` 逻辑。`NodeOverlayBadge` 组件渲染断点红点（左上角）和诊断 badge（右上角），被所有节点组件共用。
- [x] Prompt 预览联动：PromptPreviewView 已实现随选中节点/step 自动高亮置顶，支持画布选中联动
  现状：新建 `use-canvas-selection.ts` 纯 UI zustand store 追踪画布选中节点，Flow / SessionEditor 通过 `onSelectionChange` 写入，PromptPreviewView 消费后自动置顶匹配 entry、ring 高亮、滚动定位，并显示”已联动”指示器。待实现选中 PromptBuild 节点时的最终 prompt 渲染，以及 fragment 激活状态和条件命中展示。
- [x] 自定义节点显示：ManifestNode 已完善 category 图标、handle 类型标签、Inspector 选中节点信息卡片
  现状：`ManifestNode` header 新增 category 图标（signal/state/llm/transform 各有对应 lucide icon 和颜色）和 category 标签。handle 标签显示端口类型（如 `text (string)`）。`WorkbenchInspector` 新增"选中节点"卡片，消费 `useCanvasSelection` 展示节点 ID、类型、分类、输入/输出端口列表。
- [~] Config 视图编辑能力：UI 已从只读改为可编辑表单；待 Engine 补 `saveConfig` API 后接入保存
  现状：`ConfigEditor` 已改为完整的可编辑表单（Input / Select / Checkbox），支持基本信息、引擎设置、LLM 设置、重试策略的编辑。使用 `draft` state 追踪修改，显示"已修改"提示和撤销按钮。保存按钮已就绪但 disabled，等待 Engine 端补 `saveConfig` 命令后接入。
- [x] 节点配置面板优化：array 类型配置已提供结构化列表编辑（添加/删除/逐条编辑），支持 Code/List 模式切换
  现状：`ManifestNode` 的 `JsonField` 组件对 array 类型默认使用结构化列表编辑 UI，提供 Code（JSON 原始编辑）和 List（结构化编辑）图标 toggle 切换。object 类型保持 JSON Textarea 编辑。
- [x] 自动布局打磨：已添加 barycenter 交叉减少算法，层内节点按连线关系排序减少边交叉
  现状：`layoutDag` 新增 `parents` 反向邻接表，在 BFS 分层后执行 forward + backward 两轮 barycenter 排序（按父/子节点平均位置排序同层节点），声明顺序作为 tie-break。待覆盖 AI 或手写 flow JSON 时的默认布局与更多细节场景。

### Studio 排版与视觉设计

- [x] 字体系统：已引入 Inter + JetBrains Mono，中文 fallback PingFang SC / Noto Sans SC
  现状：`index.html` 通过 Google Fonts CDN 引入 Inter（UI 正文）和 JetBrains Mono（等宽），`index.css` 在 `@theme inline` 中声明 `--font-sans` 和 `--font-mono` 变量，Tailwind 自动应用到 `font-sans` / `font-mono` 工具类。
- [x] Tab Bar 层级重构：操作按钮已改为 icon-only，与视图标签视觉分离
  现状：`App.tsx` 的 Tab Bar 操作按钮（Palette / Diagnostics / Run）从 `variant="outline" size="sm"` 带文字改为 `variant="ghost" size="icon-sm"` 纯图标按钮，加 `title` tooltip。Trusted/Restricted 状态保留为紧凑 badge。视图标签区与操作区视觉权重明确分离。
- [x] Sidebar 信息精简：扩展状态标签仅在 debug preset 下显示，active 状态用绿色区分
  现状：`AppSidebar.tsx` 的 `renderExtensionGroup` 根据 `activePreset === 'debug'` 条件渲染 runtime status 标签，非 debug 模式下不再显示 ACTIVE/REGISTERED 等内部状态。active 状态用绿色文字区分。tooltip 也移除了 runtime status 后缀。
- [x] Inspector 信息精简：扩展调试详情已折叠到 CollapsibleSection，顶层只保留 ID、状态和 capability chips
  现状：`WorkbenchInspector` 新增 `CollapsibleSection` 组件，将宿主/分类/Blocked/Degraded/最近激活/capability 元数据/activation events 折叠到"扩展详情"可展开区域。顶层只展示扩展 ID、运行时状态和 capability chips。操作按钮改为并排紧凑布局。待进一步根据当前视图动态展示上下文内容（选中节点属性等）。
- [x] 节点卡片宽度自适应：根据 configSchema 字段数量动态选择宽度档位
  现状：`ManifestNode` 根据 `configSchema.properties` 数量自动选择宽度：≤1 字段 `w-64`，2-3 字段 `w-80`，≥4 字段 `w-96`。
- [x] 底部面板折叠/展开：WorkbenchPanels 已支持折叠/展开 toggle，显示面板数量
  现状：`WorkbenchPanels` 新增折叠 toggle 按钮，显示"面板 (N)"标题，点击展开/收起面板内容区域。待进一步支持拖拽调整高度和面板标签切换。
- [x] 空状态组件统一：新建 `EmptyState` 组件，已替换 18 个组件中约 25 处空状态
  现状：新建 `src/components/EmptyState.tsx`，支持 icon + message + description + action + compact 模式。已替换 DebuggerView、PromptPreviewView、VersionControlView、ReviewView、CommentsView、CommandPalette、ProblemsView、PackageManagerView、TemplateBrowserView、SessionRunDialog 以及所有 Panel 组件中的 `border-dashed` 空状态 div。
- [x] 官方视图体验改进：DeployView、H5PreviewView、TerminalView、DebuggerSummaryView 四个视图已完成体验优化
  现状：DeployView 用 EmptyState 替换配置说明区域，增加部署状态图标（Loader/CheckCircle/XCircle）；H5PreviewView 增加加载状态、错误处理、设备尺寸切换（手机/平板/桌面）；TerminalView 增加命令历史（上下箭头）、清屏按钮、输出着色；DebuggerSummaryView 用 EmptyState 替换空状态，改进 run 卡片视觉（状态图标、active ring 高亮）。
- [x] 响应式 Inspector 降级：xl 以下通过 Sheet 抽屉提供 Inspector
  现状：`App.tsx` 在 xl 以下显示一个固定在右下角的 Info 按钮，点击打开 Sheet 抽屉渲染 `WorkbenchInspector`。`WorkbenchInspector` 新增 `mobile` prop，传入时移除 `hidden xl:flex` 限制，直接渲染为 flex 列。
- [x] ExtensionSurface 无限循环 bug 修复
  现状：已修复。原因是 `ExtensionSurface.tsx` 的 `useEffect` guard 比较 `activationReason` 字符串，当同一 extension 有多个 surface（main view + inspector）时，两个实例争抢 `activationReason` 字段导致无限 re-render（React error #185）。修复方式：guard 只检查 `runtime.activated` 布尔值，不再比较 `activationReason`。

### 架构 / 基础设施

- [~] Studio Extensions 插件接口：已有 registry、capability、activation events 和动态注册基础设施；待继续打磨第三方扩展契约与接入体验
  现状：Studio 已有 extension registry、official core/workflow 扩展分层、capability catalog、activation events，以及对 `theme-pack` / `node-pack` / `template-pack` 的动态注册入口；但 workbench hooks 和 shell 仍主要消费静态 `OFFICIAL_STUDIO_EXTENSIONS` / `STUDIO_VIEWS`，动态注册的 view/panel 还没真正穿透到 UI。
- [ ] Capability Gate 后端收口：把 capability 授权上下文传到 Engine，并由服务端执行真正的权限边界
  现状：当前 capability gate 主要停留在浏览器态和 `studioStore`，更像扩展降级 / dogfooding 机制；`engineApi` 调用本身并不会把 capability context 传给后端，因此还不是安全边界。
- [~] H5 预览插件（官方内置）：Studio 内嵌 H5 预览面板已落地；待在预览中实现 UI 绑定（SignalIn/SignalOut 与前端元素的可视化关联）
  现状：`H5PreviewView` 已支持 iframe 加载、刷新、新窗口打开、加载状态指示器、错误处理和重试、设备尺寸切换（手机 375px / 平板 768px / 桌面 100%）。还没有交互式绑定能力。
- [~] 终端插件（官方内置）：已有轻量命令执行器，当前支持 `lint` / `smoke`；待升级为类似 VS Code 的 integrated terminal，可直接执行更多 kal CLI 命令
  现状：`TerminalView` 已支持命令历史（上下箭头浏览）、清屏按钮、输出着色（命令行 sky-600、错误 destructive）。Engine 端 `/api/terminal/exec` 白名单只开放 `lint` 与 `smoke`。
- [~] Vercel 部署插件（官方内置）：视图与 API stub 已落地；待接入真实打包部署、部署状态监控和日志查看
  现状：`DeployView` 已用 EmptyState 替换配置说明区域，增加部署状态图标（Loader2 旋转 / CheckCircle2 成功 / XCircle 失败），按钮在部署中显示 spinner。Engine 端 `/api/tools/deploy` 目前返回 `DEPLOY_NOT_CONFIGURED`。
- [ ] UI 绑定方案：定义 SignalIn/SignalOut 作为 UI 绑定契约的规范，H5 预览插件作为首个落地场景
  下一步：先确定最小契约，包括元素选取方式、SignalIn/SignalOut 命名规则、事件映射和数据回传格式，再让 H5 预览基于这套契约做第一版可视化绑定。
- [~] 版本控制语义覆盖：已有 transactions / checkpoints / semantic compare UI；待把 `config` / `state` 纳入 checkpoint、restore 与 diff
  现状：`resourceVersions` 已为 `config://project` / `state://project` 建立占位，但 `RestorableSnapshot` 目前只包含 `flows` + `session`，`compareSnapshot()` 也仍把 `configChanged` / `stateChanged` 固定为 `false`。
- [~] State 变更日志：run/debug 已能展示 state diff；待把每次 WriteState 的 before/after diff 提炼成可持久查询的统一日志
  现状：`DebuggerView` / `StateDiffPanel` 已可读取 run state summary 中的 changed values，但这套 diff 仍附着在 managed run 记录上，没有进入独立 history/state log 抽象。
- [x] State 约束声明：`initial_state.json` 已支持 `min`/`max`/`enum` 约束
  现状：`StateValue` 类型、`StateStore.loadInitialState()`、相关测试和参考文档都已覆盖；当前运行时策略为 number clamp、string enum fallback。若后续要改成严格拒绝/告警，应单独列为“约束策略可配置”任务。
- [~] `kal debug --state` 输出可读的状态快照；待支持 diff 两个快照
  现状：CLI 已支持 `--state`、`--run-id|--latest` 和 `--format pretty|json|agent`，pretty 输出会展示 run/status/cursor/state preview/full state；还缺少 snapshot-vs-snapshot 的对比命令。

### Devkit / 工具链

- [ ] Eval 跨模型对比：增加 --model 参数，支持同一 prompt 跑不同模型并对比结果（当前仅支持 variant 对比）
  下一步：先确定模型标识与 provider 配置的传参方式，避免 `variant`、`model`、`provider` 三套概念在 CLI 上互相重叠。
- [~] Lint 增强：已增加类型不匹配检查和 enum 约束检查；待检查 configSchema 中过于宽泛的 type 定义
  现状：`validateNodeConfig` 已新增 `CONFIG_TYPE_MISMATCH`（config 值类型与 schema 声明不匹配）和 `CONFIG_INVALID_ENUM`（config 值不在 enum 范围内）两个检查规则。`UNUSED_FLOW` 已修复为同时检查 session step 的 flowRef 和 flow 内部 SubFlow 节点的 ref 引用。待增加 configSchema 宽泛类型（如 `object` 代替具体结构）的警告规则。
- [x] CI 配置：GitHub Actions 跑 `pnpm test` + `pnpm typecheck`
  现状：已创建 `.github/workflows/ci.yml`，配置 Node 22 + Bun latest + pnpm 9，跑 core/engine 的 build、typecheck 和 test，以及 studio build。使用 pnpm cache 加速依赖安装。

### 内容 / 示例

- [ ] Showcase 游戏：选定类型（候选：AI 狼人杀、AI 侦探推理、AI 角色养成、AI TTRPG 单人冒险），完成设计文档，实现 15-30 分钟可玩时长，playtest 至少 10 轮
  下一步：先在四个候选里收敛到一个最适合当前引擎能力的题材，再拆成设计文档、核心 loop、内容实现、playtest 四个阶段推进。
- [ ] 简化 dnd-adventure：减少冗余 flow，合并重复的状态处理逻辑
  现状：当前工作区里已有对 `dnd-adventure` 多个 flow 的未提交调整，主要集中在节点位置和部分 `WriteState` 配置补齐，尚不构成真正的“简化”完成。
  下一步：先梳理重复 flow、重复 PromptBuild / WriteState 模式和可下沉的子流程，再做结构性合并。
- [x] 确保 dnd-adventure 能用 `kal lint` 零警告通过
  现状：已修复 dnd-adventure 的所有 lint 问题（Message 节点 config 中移除 system/user/context 冗余字段）；修复 lint 工具的 UNUSED_FLOW 误报（现在会检查 flow 内部 SubFlow 节点的 ref 引用）；dnd-adventure 已通过零警告 lint 检查。guess-who 示例项目不存在。

### 文档

- [ ] 文档 / Skills 规范性写作：统一格式与内容，确保一致性和可维护性
  下一步：先定义统一模板和最小字段集，再逐篇迁移，避免一边写新文档一边继续引入新格式。
- [x] 写 "Design Patterns" 文档：常见游戏模式的 KAL 实现方式（回合制循环、分支叙事、角色创建、物品系统、对话历史管理）
  现状：已创建 `docs/design-patterns.md`，覆盖 7 个模式：Turn-Based Loop、Branching Narrative、Character Creation、Inventory System、Conversation History Management、SubFlow Composition、Preset/Template Pattern。每个模式包含 session/flow 结构示例和 dnd-adventure 引用。
- [x] 写 "Troubleshooting" 文档：常见错误和解决方法
  现状：已创建 `docs/troubleshooting.md`，覆盖四大类：Lint Issues（CONFIG_UNKNOWN_FIELD / UNUSED_FLOW / MISSING_REQUIRED_INPUT / STATE_KEY_NOT_FOUND / CONFIG_TYPE_MISMATCH）、Debug Issues（waiting_input / immediate error / breakpoints）、Studio Connection Issues（loading / stale data / infinite re-render）、Custom Node Issues（not loading / type conflict / not in Studio）。
- [x] 写 "Custom Nodes Guide"：从零创建自定义节点的完整教程
  现状：已创建 `docs/custom-nodes.md`，包含最小示例、CustomNode 接口说明、configSchema 用法、ExecutionContext 用法、CharacterGen 实战示例、Studio 集成说明和发布前 checklist。

### 社区 / 发布

- [ ] npm 发布 `@kal-ai/core` 和 `@kal-ai/engine`
  阻塞：需要先确认包边界、导出面、版本策略和发布前 smoke/lint/test 清单，避免第一次发布就暴露不稳定 API。
- [ ] CONTRIBUTING.md：如何贡献代码、如何提 issue、代码规范
  下一步：先沉淀最小贡献流程，包括本地启动、测试命令、分支/提交规范和 issue 模板，再补更细的架构约定。

## 之后

- [ ] `npx create-kal-game` 脚手架
  下一步：先评估它与现有 `kal init` 的关系，是对外分发包装层还是独立模板入口，避免两套脚手架长期并存。
- [ ] 在线 Playground
  阻塞：依赖更稳定的浏览器侧运行方案、示例资产裁剪和安全边界设计，否则很容易先做出难维护的 demo。
- [ ] `kal generate` 从自然语言生成 flow JSON
  下一步：先限定输入输出范围，例如只生成单个 flow 或骨架 session，再逐步扩展到多资源联动和自动修复。
