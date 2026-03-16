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
- [x] getting-started.md 命令路径更新为 `kal` CLI
- [x] engine 核心测试（cli.test.ts、runtime.test.ts、server.test.ts、run-manager.test.ts）

## 3/21 前完成

### Studio / 编辑器

- [ ] 可视化 Debug：在画布中展示执行状态（节点高亮、断点、单步执行、运行面板），CLI debug 已实现。Smoke 回放作为 Debug 的"Run All"模式集成
- [ ] Lint 内联诊断：画布节点上实时标红/标黄显示 lint 问题（缺连线、config 错误、未使用 flow 等），CLI lint 已有 5 类检查
- [ ] Prompt 预览面板：选中 PromptBuild 节点时侧边栏实时渲染最终 prompt，展示 fragment 激活状态（✓/✗）和条件命中情况
- [ ] 自定义节点显示：让 editor 能渲染 node/ 目录下用户定义的自定义节点 manifest（目前仅支持内置节点）
- [ ] 节点配置面板优化：当 configSchema type 为 object/array 时，提供更友好的编辑 UI，替代原始 JSON textarea
- [ ] 自动布局：AI 或用户写 flow JSON 时无需手写 position 坐标，系统自动计算节点位置（进行中）

### 架构 / 基础设施

- [ ] Studio Extensions 插件接口：让功能以插件形式接入 Studio，支持第三方扩展
- [ ] H5 预览插件（官方内置）：Studio 内嵌 H5 预览面板，支持在预览中进行 UI 绑定（SignalIn/SignalOut 与前端元素的可视化关联）
- [ ] 终端插件（官方内置）：Studio 侧边栏集成终端，类似 VS Code 的 integrated terminal，可直接执行 kal CLI 命令
- [ ] Vercel 部署插件（官方内置）：一键打包并部署项目到 Vercel，集成部署状态监控和日志查看
- [ ] UI 绑定方案：定义 SignalIn/SignalOut 作为 UI 绑定契约的规范，H5 预览插件作为首个落地场景
- [ ] State 变更日志：每次 WriteState 记录 before/after diff
- [ ] State 约束声明：在 initial_state.json 中支持 `min`/`max`/`enum` 约束，不只是 type
- [ ] `kal debug --state` 输出可读的状态快照，支持 diff 两个快照

### Devkit / 工具链

- [ ] Eval 跨模型对比：增加 --model 参数，支持同一 prompt 跑不同模型并对比结果（当前仅支持 variant 对比）
- [ ] Lint 增强：增加更详细的错误信息；检查 configSchema 中过于宽泛的 type 定义（如不应偷懒写 object）
- [ ] CI 配置：GitHub Actions 跑 `pnpm test` + `pnpm typecheck`

### 内容 / 示例

- [ ] Showcase 游戏：选定类型（候选：AI 狼人杀、AI 侦探推理、AI 角色养成、AI TTRPG 单人冒险），完成设计文档，实现 15-30 分钟可玩时长，playtest 至少 10 轮
- [ ] 简化 dnd-adventure：减少冗余 flow，合并重复的状态处理逻辑
- [ ] 确保 dnd-adventure 和 guess-who 都能用 `kal lint` 零警告通过

### 文档

- [ ] 文档 / Skills 规范性写作：统一格式与内容，确保一致性和可维护性
- [ ] 写 "Design Patterns" 文档：常见游戏模式的 KAL 实现方式（回合制循环、分支叙事、角色创建、物品系统、对话历史管理）
- [ ] 写 "Troubleshooting" 文档：常见错误和解决方法
- [ ] 写 "Custom Nodes Guide"：从零创建自定义节点的完整教程

### 社区 / 发布

- [ ] npm 发布 `@kal-ai/core` 和 `@kal-ai/engine`
- [ ] CONTRIBUTING.md：如何贡献代码、如何提 issue、代码规范

## 之后

- [ ] `npx create-kal-game` 脚手架
- [ ] 在线 Playground
- [ ] `kal generate` 从自然语言生成 flow JSON
