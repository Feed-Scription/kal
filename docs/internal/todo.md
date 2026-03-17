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
- [~] Config 视图编辑能力：写入链已完成（Engine → API → store → hook）；待 `ConfigEditor` 保存按钮接通 `updateConfig()`
- [~] 节点配置面板优化：array 类型已有结构化列表编辑；PromptBuild `fragments` 和 WriteState `allowedKeys`/`operations` 仍待表单化
- [~] 自动布局：DAG 布局 + barycenter 排序已落地；复杂图场景和 AI 生成 flow 的默认布局待打磨

### 官方插件

- [~] H5 预览插件：iframe 加载 + 设备尺寸切换已落地；待实现 UI 绑定（SignalIn/SignalOut 与前端元素的可视化关联）
- [~] 终端插件：命令历史 + 清屏 + 着色 + 7 命令白名单已落地；待升级为 integrated terminal
- [~] Vercel 部署插件：视图 + API stub 已落地；待接入真实打包部署

### 社区 / 发布

- [~] npm 首次发布：准备工作已完成，待确认版本策略并执行 `pnpm changeset` + `pnpm release`

---

## 待做

### 功能

- [ ] UI 绑定方案：定义 SignalIn/SignalOut 作为 UI 绑定契约，H5 预览插件作为首个落地场景
- [ ] `kal generate` 从自然语言生成 flow JSON

### 内容

- [ ] Showcase 游戏：选定题材，设计文档 → 实现 → playtest（15-30 分钟可玩时长）

### 平台

- [ ] 在线 Playground
