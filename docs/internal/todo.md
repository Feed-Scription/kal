# TODO

## 已完成

### CLI 工具链

- [x] `kal init` 项目脚手架（`--template minimal|game`）
- [x] `kal debug` 可恢复调试（`--start/--continue/--step/--state/--list/--delete/--retry/--skip`，`--format agent`，`--diff`）
- [x] `kal lint` 项目级静态分析（session 校验、unused flow、state key、deep node validation、severity/location、CONFIG_SCHEMA_MISSING_TYPE）
- [x] `kal smoke` 最小自动化 smoke test
- [x] `kal eval` prompt 评估工具链（nodes/render/run/compare，`--model` 跨模型对比）
- [x] `kal schema` 导出 node 和 session schema
- [x] `kal config` 配置管理（含 API 密钥加密存储）
- [x] `kal studio` 集成 editor 的一体化服务
- [x] `npx create-kal-game` 脚手架（共享模板定义已抽取到 `scaffold-templates.ts`）

### Studio 编辑器

- [x] 可视化 Debug：画布执行状态高亮（蓝色脉冲/绿色呼吸/灰色已访问/红点断点）+ Smoke Run 按钮集成到 DebuggerView
- [x] Lint 内联诊断：画布节点根据 diagnostics 实时标红/标黄，右上角诊断数量 badge
- [x] Prompt 预览面板：选中 PromptBuild 节点展示最终渲染结果（renderedText + fragment 激活状态 + 条件命中）
- [x] Config 视图编辑能力：`ConfigEditor` 已接通 `updateConfig()`，支持保存、错误提示与受限字段保留
- [x] 字体系统：Inter + JetBrains Mono，中文 fallback PingFang SC / Noto Sans SC
- [x] Tab Bar 层级重构：操作按钮 icon-only，与视图标签视觉分离
- [x] Sidebar 信息精简：扩展状态标签仅 debug preset 显示，active 视图优先排序
- [x] Inspector 内容重构：折叠扩展详情，顶层只展示核心信息
- [x] 节点卡片宽度自适应：根据 configSchema 字段数量动态选择宽度档位
- [x] 底部面板折叠/展开
- [x] 空状态组件统一：`EmptyState` 组件替换 18 个组件约 25 处空状态
- [x] 响应式 Inspector 降级：xl 以下通过 Sheet 抽屉提供
- [x] ExtensionSurface 无限循环 bug 修复

### 架构 / 基础设施

- [x] Studio Extensions 插件接口：registry、capability、activation events、动态注册
- [x] Capability Gate 后端收口：`X-Studio-Capabilities` header + 服务端权限检查
- [x] 版本控制语义覆盖：checkpoint/restore/undo/redo/diff 全链路覆盖 config + state
- [x] State 变更日志：`stateChangeLog` 在 run/debug advance 自动累积
- [x] State 约束声明：`initial_state.json` 支持 `min`/`max`/`enum`
- [x] Constant / ComputeState configSchema 收紧（oneOf 约束）
- [x] CI：GitHub Actions build + typecheck + test + studio build + example lint + pack 验证

### 文档 / 社区

- [x] README 英文默认 + 中文版独立，节点数量修正为 17
- [x] 文档格式统一（H1 → 描述 → 正文 → See Also），重复文档合并（3 对 → guides/），docs/README.md 补全链接
- [x] Design Patterns / Troubleshooting / Custom Nodes Guide / CONTRIBUTING.md
- [x] CLI reference / nodes reference / session-steps / config / hooks（auto-generated）
- [x] 示例项目 `dnd-adventure` lint 零警告，CI 已覆盖
- [x] npm 发布准备：publishConfig、exports、files、per-package README、pnpm pack 验证通过

---

## 进行中

### Studio 编辑器

- [x] 自定义节点显示：ManifestNode 全 schema 类型覆盖 + Inspector config 摘要 + smoke 测试
  已完成：`ConfigField` 新增 Constant.value 类型感知编辑器（根据 sibling `type` 字段切换 string/number/boolean）、ComputeState.operand 数字输入（lookup 模式保留 JSON）、ComputeState.trueValue/falseValue 自动类型推断输入、GenerateText.historyPolicy 内联 maxMessages 编辑。Inspector 已展示选中节点 config 摘要。`apps/studio/test-fixtures/node-pack-smoke-flow.json` 覆盖全部 17 种内置节点的 schema 编辑验证。
  小 todo：
  - [x] 为 Inspector 增加选中节点当前 config 摘要，减少只看元信息不看配置的割裂感
  - [x] 盘点当前内置节点和示例项目里仍频繁回退 JSON 的 schema 字段
  - [x] 用一个自定义 node-pack 做完整 smoke，验证 manifest/defaultConfig/inputs/outputs 在 Studio 中的兼容性
  - [ ] 补一轮手工验证清单：`enum`、`boolean`、`ref`、`array<object>`、`object` 五类 schema 的编辑体验
- [x] 节点配置面板优化：PromptBuild `fragments` 全 5 类型结构化编辑 + WriteState 三字段结构化编辑
  已完成：`PromptBuildFragmentsField` 支持 `base / field / when / randomSlot / budget` 全部 5 种 fragment 类型的结构化编辑（含 randomSlot 候选列表 + seed 选择、budget maxTokens/strategy/weights/子 fragments）。`WriteState` 新增 `WriteStateOperationsField`（per-key 操作类型选择器）、`WriteStateConstraintsField`（per-key min/max）、`WriteStateDeduplicateByField`（per-key 去重字段，仅对 appendMany 生效）。所有编辑器保留 JSON fallback 切换。
- [x] 自动布局：Flow 画布回边视觉处理 + 自适应间距 + 触发条件优化
  已完成：Flow 画布现在与 Session 一致，对回边应用橙色虚线 + “循环”标签 + ArrowClosed marker。`autoLayout()` 始终计算 backEdges 即使跳过位置重排。`layoutDag()` 新增自适应间距：当单层节点 >4 时按密度因子放大 horizontalStride/verticalStride，避免密集图重叠。手动 Auto Layout 按钮也会重新应用回边样式。

### 官方插件

- [x] Studio 游玩面板：底部 Play Panel 已接入 managed run
  已完成：底部 `Terminal` 面板替换为原生 TUI 风格的 `PlayPanel`，直接复用 Engine managed runs（`createRun` / `advanceRun`）进行文字试玩。面板支持 transcript 累积、Prompt/Choice 输入、重新开始与停止；调试 trace/state 仍保留在现有 panel。旧的 terminal session API 仍在 Engine 中保留，但不再作为默认底部 panel 暴露。
- [x] Vercel 部署插件：真实 Vercel API 集成 + 部署记录/重试 UI 已落地
  已完成：Engine `/api/tools/deploy` 从 501 stub 升级为真实 Vercel Deploy API 调用。支持 `VERCEL_TOKEN`、`VERCEL_PROJECT_ID`、`VERCEL_TEAM_ID` 环境变量配置，返回 deploymentId、url、readyState、createdAt。Studio `DeployView` 新增最近部署记录卡片（ID/URL/状态/时间）、外链跳转、重新部署按钮。`engine-client.ts` 的 `triggerDeploy()` 支持传入 projectId/teamId 参数。

### 社区 / 发布

- [~] npm 首次发布：准备工作已完成，待确认版本策略并执行 `pnpm changeset` + `pnpm release`
  现状：`@kal-ai/core`、`@kal-ai/engine`、`create-kal-game` 都已写好 `0.1.0`、`publishConfig`、`prepublishOnly` 和 `release` 脚本，CI 也会做 `pnpm pack --dry-run`；`.changeset/` 目前只有 `config.json`，还没有首个 changeset 或实际发布记录。
  小 todo：
  - [ ] 确认首次发布版本策略和三个包的版本联动方式
  - [ ] 编写首个 changeset，明确 release notes 范围
  - [ ] 在干净环境验证安装链路：`@kal-ai/core`、`@kal-ai/engine`、`create-kal-game`
  - [ ] 执行首次发布并回填 README / docs 中的安装命令

---

## 待做

### 功能

- [ ] `kal generate` 从自然语言生成 flow JSON
  现状：CLI 入口 `apps/engine/src/cli.ts` 目前只有 `studio / serve / play / debug / lint / smoke / eval / init / schema / config`，仓库里也没有同名命令或 API，属于未开工。
  小 todo：
  - [ ] 限定 v1 范围：先只生成单个 flow，还是同时生成 session 骨架
  - [ ] 设计 prompt、输出 JSON schema 和失败后的 repair loop
  - [ ] 接入 CLI 命令和 Engine 实现，至少支持 dry-run 输出
  - [ ] 接上 lint/validate，避免生成结果直接落成无效 flow
  - [ ] 补最小文档和 golden tests

### 内容

- [~] Showcase 游戏：`showcase-signal-watch` 已落地并通过 lint；后续仍需补 playtest 与进一步打磨
  现状：`examples/showcase-signal-watch` 已有完整 `session.json`、flows、README，并提供 `kal lint`、`kal play` 和 `kal smoke --dry-run` 跑法；目前还看不到单独的设计文档、playtest 记录或更长时长的内容扩展。
  小 todo：
  - [ ] 补一份简短设计文档，写清核心 loop、资源系统和胜负条件
  - [ ] 增加 1-2 组额外事件/结局分支，拉开回放差异
  - [ ] 固化一组代表性 smoke 输入，作为回归样例
  - [ ] 做至少一轮真实 playtest，并记录问题与调优项
  - [ ] 补 README 中的玩法截图或录屏链接

### 平台

- [ ] 在线 Playground
  现状：仓库当前只有 `apps/editor`、`apps/engine`、`apps/studio` 三个应用，没有独立 playground app、浏览器侧运行沙箱或 hosted demo 管线；相关实现基本未启动。
  小 todo：
  - [ ] 明确 Playground 运行模型：浏览器端执行、服务端托管，还是混合模式
  - [ ] 搭最小 app shell，支持加载一个示例项目并展示输入输出
  - [ ] 解决浏览器侧运行所需的资产裁剪、沙箱和持久化边界
  - [ ] 补分享链接或导入示例能力，确保 Playground 不是一次性 demo
