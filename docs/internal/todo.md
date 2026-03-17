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
- [~] 修正 concepts.md 和 README.md 中的节点数量
  现状：concepts.md 和 nodes.md 已修正为 17，但 README.md:280 和 README.zh-CN.md:279 仍写 "20 built-in nodes / 20 个内置节点"，需同步修正。
- [x] getting-started.md 命令路径更新为 `kal` CLI
- [x] engine 核心测试（cli.test.ts、runtime.test.ts、server.test.ts、run-manager.test.ts）

## 3/21 前完成

状态说明：`[ ]` 未完成；`[~]` 进行中 / 基础版已落地但尚未达到目标定义；`[x]` 已完成。

### Studio / 编辑器

- [~] 可视化 Debug：已有 Debugger 视图、run 列表、断点、单步、继续、重放；待在画布中展示执行状态（节点高亮等），并把 Smoke 回放集成为 Debug 的 "Run All" 模式
  现状：`DebuggerView` 已能创建 managed run、选择 run、查看状态快照 / timeline / state diff / 输入历史，并对当前 step 做断点、单步、继续和重放操作。
- [~] Lint 内联诊断：已有 Problems 视图、diagnostics 刷新和事件链；待在画布节点上实时标红/标黄显示 lint 问题（缺连线、config 错误、未使用 flow 等）
  现状：Studio 已接通 `/api/diagnostics`、Problems 视图、diagnostics 刷新命令和 `diagnostics.updated` / `resource.changed` 事件，但诊断结果还停留在独立视图，没有回写到画布节点。
- [~] Prompt 预览面板：已有 Prompt Preview 视图与 prompt-like 配置检索；待实现选中 PromptBuild 节点时的最终 prompt 渲染，以及 fragment 激活状态和条件命中展示
  现状：当前可从 Session step 与 Flow 节点配置中提取 prompt-like 文本与 bindings，支持全局搜索和预览；还没有做到“随选中节点实时联动”的精细化预览。
- [~] 自定义节点显示：Flow 已基于 `nodeManifests` 渲染节点与菜单；待继续验证 editor 全链路体验，补齐自定义节点的配置编辑与展示细节
  现状：Engine 已把项目的 `nodeManifests` 暴露给 Studio，Flow 画布和右键菜单会按 manifest 渲染节点；当前仍需继续验证不同 schema、配置编辑和 inspector 侧的兼容性。
- [~] Config 视图编辑能力：已有 Config 视图与扩展入口；待把配置修改真正接入 `project.write` 与 transaction 落盘链
  现状：registry 把 `kal.config-editor` 声明为可写扩展，但 `ConfigEditor` 当前仍是 canonical config 的只读展示，没有对应的保存命令、版本更新与 diagnostics 回流。
- [ ] 节点配置面板优化：当 configSchema type 为 object/array 时，提供更友好的编辑 UI，替代原始 JSON textarea
  下一步：先盘点当前哪些节点的 `configSchema` 已经稳定出现 object/array，再优先给高频节点补表单化编辑器，避免一次性做成通用但难维护的大而全方案。
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

- [~] Studio Extensions 插件接口：已有 registry、capability、activation events 和动态注册基础设施；待继续打磨第三方扩展契约与接入体验
  现状：Studio 已有 extension registry、official core/workflow 扩展分层、capability catalog、activation events，以及对 `theme-pack` / `node-pack` / `template-pack` 的动态注册入口；但 workbench hooks 和 shell 仍主要消费静态 `OFFICIAL_STUDIO_EXTENSIONS` / `STUDIO_VIEWS`，动态注册的 view/panel 还没真正穿透到 UI。
- [ ] Capability Gate 后端收口：把 capability 授权上下文传到 Engine，并由服务端执行真正的权限边界
  现状：当前 capability gate 主要停留在浏览器态和 `studioStore`，更像扩展降级 / dogfooding 机制；`engineApi` 调用本身并不会把 capability context 传给后端，因此还不是安全边界。
- [~] H5 预览插件（官方内置）：Studio 内嵌 H5 预览面板已落地；待在预览中实现 UI 绑定（SignalIn/SignalOut 与前端元素的可视化关联）
  现状：`H5PreviewView` 已以内嵌 iframe 方式加载 `/api/tools/h5-preview`，支持刷新和新窗口打开，当前主要用于压测 preview surface，还没有交互式绑定能力。
- [~] 终端插件（官方内置）：已有轻量命令执行器，当前支持 `lint` / `smoke`；待升级为类似 VS Code 的 integrated terminal，可直接执行更多 kal CLI 命令
  现状：Studio 端已有 Terminal 视图和输出面板，Engine 端提供 `/api/terminal/exec`，目前白名单只开放 `lint` 与 `smoke` 两个命令。
- [~] Vercel 部署插件（官方内置）：视图与 API stub 已落地；待接入真实打包部署、部署状态监控和日志查看
  现状：Studio 已有 Deploy 视图和触发按钮，Engine 端 `/api/tools/deploy` 目前返回 `DEPLOY_NOT_CONFIGURED`，说明接口骨架已在，实际部署链路尚未接入。
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
- [ ] Lint 增强：增加更详细的错误信息；检查 configSchema 中过于宽泛的 type 定义（如不应偷懒写 object）
  下一步：先整理当前最常见但信息不足的 diagnostics，再补 message / suggestion 模板；`configSchema` 宽泛类型检查可作为新增规则单独落地。
- [ ] CI 配置：GitHub Actions 跑 `pnpm test` + `pnpm typecheck`
  下一步：先确认 monorepo 在 CI 环境下的最小稳定命令集合，再补缓存、Node/Bun 版本和失败时的日志输出，避免本地能跑、CI 不稳定。

### 内容 / 示例

- [ ] Showcase 游戏：选定类型（候选：AI 狼人杀、AI 侦探推理、AI 角色养成、AI TTRPG 单人冒险），完成设计文档，实现 15-30 分钟可玩时长，playtest 至少 10 轮
  下一步：先在四个候选里收敛到一个最适合当前引擎能力的题材，再拆成设计文档、核心 loop、内容实现、playtest 四个阶段推进。
- [ ] 简化 dnd-adventure：减少冗余 flow，合并重复的状态处理逻辑
  现状：当前工作区里已有对 `dnd-adventure` 多个 flow 的未提交调整，主要集中在节点位置和部分 `WriteState` 配置补齐，尚不构成真正的“简化”完成。
  下一步：先梳理重复 flow、重复 PromptBuild / WriteState 模式和可下沉的子流程，再做结构性合并。
- [ ] 确保 dnd-adventure 和 guess-who 都能用 `kal lint` 零警告通过
  下一步：先把示例项目的 lint 问题做成可重复检查列表，逐个清理，最后再用 CI 或脚本把“示例必须零警告”固定下来。

### 文档

- [ ] 文档 / Skills 规范性写作：统一格式与内容，确保一致性和可维护性
  下一步：先定义统一模板和最小字段集，再逐篇迁移，避免一边写新文档一边继续引入新格式。
- [ ] 写 "Design Patterns" 文档：常见游戏模式的 KAL 实现方式（回合制循环、分支叙事、角色创建、物品系统、对话历史管理）
  下一步：优先从已经在示例里出现过的模式写起，文档里同时给出 pattern 说明、最小 flow 结构和对应示例链接。
- [ ] 写 "Troubleshooting" 文档：常见错误和解决方法
  下一步：从真实高频问题入手，先覆盖 `lint` / `debug` / Studio 连接 / 自定义节点四类，再逐步扩展。
- [ ] 写 "Custom Nodes Guide"：从零创建自定义节点的完整教程
  下一步：基于现有 custom node test fixture 提炼一个最小可运行示例，再补 manifest、schema、Studio 展示和常见坑。

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
