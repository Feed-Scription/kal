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

- [~] 自定义节点显示：`ManifestNode` 已渲染节点与菜单；待验证不同 schema 的配置编辑和 inspector 兼容性
  现状：`ManifestNode` 已按 manifest 渲染分类图标、带类型标签的 handles、动态宽度和默认配置合并；`WorkbenchInspector` 能展示选中节点的 ID/类型/分类/输入/输出，但编辑仍主要发生在节点卡片内，复杂 schema 仍多回退为通用字段或 JSON。
  小 todo：
  - [ ] 盘点当前内置节点和示例项目里仍频繁回退 JSON 的 schema 字段
  - [ ] 为 Inspector 增加选中节点当前 config 摘要，减少只看元信息不看配置的割裂感
  - [ ] 用一个自定义 node-pack 做完整 smoke，验证 manifest/defaultConfig/inputs/outputs 在 Studio 中的兼容性
  - [ ] 补一轮手工验证清单：`enum`、`boolean`、`ref`、`array<object>`、`object` 五类 schema 的编辑体验
- [~] 节点配置面板优化：PromptBuild `fragments` 与 WriteState `allowedKeys` 已有专用编辑器；未覆盖 fragment 类型和更复杂的对象配置仍待继续收口
  现状：`PromptBuildFragmentsField` 已支持 `base / field / when` 的增删改排；一旦出现 `randomSlot`、`budget` 等未覆盖类型会自动退回 JSON 模式。`WriteState` 目前只有 `allowedKeys` 是 tag/list 编辑，`operations`、`constraints`、`deduplicateBy` 仍是对象 JSON。
  小 todo：
  - [ ] 为 PromptBuild 增加 `randomSlot` 结构化编辑器
  - [ ] 为 PromptBuild 增加 `budget` 结构化编辑器，并支持其子 fragments 编辑
  - [ ] 为 WriteState `operations` 提供按 key 的操作类型选择器
  - [ ] 为 WriteState `constraints` 和 `deduplicateBy` 提供结构化 map 编辑器
- [~] 自动布局：已增加 cycle-aware back-edge 过滤与加权 barycenter 排序；复杂图场景和 AI 生成 flow 的默认布局仍待打磨
  现状：`layoutDag()` 已被 Flow / Session 共用，支持回边识别和双向 weighted barycenter 排序；Session 会把回边标成橙色“循环”边，Flow 也有手动 Auto Layout，但初始坐标策略仍偏启发式，复杂图下还没有更强的布局约束。
  小 todo：
  - [ ] 明确自动布局触发条件：无坐标、全重叠、AI 生成 flow、手工导入 flow
  - [ ] Flow 画布也对回边做差异化视觉处理，而不只在 Session 中标注“循环”
  - [ ] 为复杂图补固定样例，覆盖多分支、回环、长链混合场景
  - [ ] 调整层间距和节点间距策略，避免大节点与密集边场景重叠

### 官方插件

- [~] H5 预览插件：iframe 加载 + 设备尺寸切换已落地；待实现 UI 绑定（SignalIn/SignalOut 与前端元素的可视化关联）
  现状：Engine `/api/tools/h5-preview` 目前返回的是 project / active managed run 摘要页，Studio 端只是在 iframe 里加载并提供刷新、错误态和设备切换；还没有真实 H5 资源接入、元素选择、事件桥接或 state/signal 双向同步。
  小 todo：
  - [ ] 确定 preview 输入源是“Engine 生成摘要页”还是“项目自带前端入口”
  - [ ] 定义 iframe 与 Studio 间的 `postMessage` 协议，覆盖 run、state、signal 三类消息
  - [ ] 为 preview 暴露当前 active run/state 的只读同步能力
  - [ ] 做一个最小 UI 绑定 demo，验证前端元素可以映射到 `SignalIn` / `SignalOut`
- [~] 终端插件：命令历史 + 清屏 + 着色 + 7 命令白名单已落地；待升级为 integrated terminal
  现状：当前协议仍是一次性 `execCommand(command)`，只允许 `lint / smoke / schema / debug-list / debug-state / config / eval` 七个命令；没有 PTY、流式 stdout、cwd 切换或交互式进程管理。
  小 todo：
  - [ ] 设计 terminal session API：create / write / resize / kill / stream
  - [ ] 后端接入 PTY 或等价进程桥接，支持持续输出和中断
  - [ ] 前端支持流式输出、长任务状态和 Ctrl+C/停止能力
  - [ ] 保留现有白名单 quick commands 作为轻量 fallback
- [~] Vercel 部署插件：视图 + API stub 已落地；待接入真实打包部署
  现状：`DeployView` 已有部署状态 UI 和错误提示，但 Engine `/api/tools/deploy` 仍固定返回 `DEPLOY_NOT_CONFIGURED` 501；真实构建、上传、日志和 deployment URL 还没接通。
  小 todo：
  - [ ] 明确部署所需配置：`VERCEL_TOKEN`、project id、team scope、输出目录
  - [ ] 在 Engine 里接通真实打包和 deploy trigger
  - [ ] 返回 deployment URL、状态和错误详情，而不只是 501 stub
  - [ ] 在 Studio 中展示最近一次部署记录、日志入口和重试按钮

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

- [ ] UI 绑定方案：定义 SignalIn/SignalOut 作为 UI 绑定契约，H5 预览插件作为首个落地场景
  现状：Core 侧已经有 `SignalIn` / `SignalOut` 通道契约和校验，但 Studio / H5 preview 还没有 DOM 绑定协议、selector 模型、事件映射或数据回传格式；这项还是设计空白，不是差收尾。
  小 todo：
  - [ ] 定义绑定模型：元素选择器、方向、事件名、channel 名、payload 形状
  - [ ] 定义运行时桥接协议：UI 事件如何进入 `SignalIn`，`SignalOut` 如何回推到 UI
  - [ ] 定义 Studio 里的配置入口：节点侧配置、preview overlay 还是独立面板
  - [ ] 选一个示例项目做首个契约验证，并沉淀文档
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
