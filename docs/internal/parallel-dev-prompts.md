# 双人并行开发 Prompt

## Prompt A — Studio / 前端体验线

你是项目中的 A，负责 Studio 前端体验。

### 目标

在现有 Engine + Kernel + Store 之上，把 Studio 做到更好用、更稳定、更清晰。你负责的是"体验层"——视图组件、交互、样式和面向视图的派生逻辑。

### 文件权限

主要修改（你的主责）：
- `apps/studio/src/App.tsx`
- `apps/studio/src/AppSidebar.tsx`
- `apps/studio/src/Flow.tsx`
- `apps/studio/src/SessionEditor.tsx`
- `apps/studio/src/components/*`
- `apps/studio/src/nodes/*`
- `apps/studio/src/hooks/*`（纯 UI / 派生逻辑）
- `apps/studio/src/index.css`、`apps/studio/src/App.css`

可以读取、可以加 selector / 派生逻辑：
- `apps/studio/src/kernel/hooks.ts`
- `apps/studio/src/kernel/registry.tsx`（可改文案、排序、展示入口）

默认不改（归 B 主责）：
- `apps/studio/src/store/studioStore.ts` 的 state shape、transaction 语义、command contract
- `apps/studio/src/api/*`、`apps/studio/src/types/*`
- `apps/engine/src/*`、`packages/core/src/*`

### 任务优先级（按顺序执行）

**P0 — 立即可做，无外部依赖**

1. 字体系统
   - 在 `index.css` 引入 `--font-sans` / `--font-mono` CSS 变量
   - sans: `Geist` 或 `DM Sans`，中文 fallback `"PingFang SC", "Noto Sans SC"`
   - mono: `JetBrains Mono`
   - 完成定义：所有 UI 文字使用 sans 变量，所有 `font-mono` 场景使用 mono 变量

2. 空状态组件统一
   - 抽取 `EmptyState` 组件（icon + title + description + optional action）
   - 替换 StateManager、ProblemsView、DebuggerView 等处的临时空状态
   - 完成定义：所有视图的空状态使用同一组件，风格一致

3. Sidebar 信息精简
   - 扩展状态标签（ACTIVE / REGISTERED）仅在 `debug` preset 下显示
   - 工作流扩展按当前 preset 过滤，非相关项默认折叠
   - 完成定义：默认 `authoring` preset 下 sidebar 只显示用户关心的视图和 flow 列表

4. Tab Bar 层级重构
   - 操作按钮（Palette / Diagnostics / Run / Trusted）改为 icon-only 或移到独立区域
   - 视图标签区加滚动渐变遮罩
   - 完成定义：标签和操作按钮视觉权重明确分离

**P1 — 需要消费现有数据，无需 B 新增 API**

5. Inspector 内容重构
   - Flow 视图 → 展示选中节点属性、flow 统计
   - Session 视图 → 当前 step 详情
   - State 视图 → state 统计摘要
   - 扩展调试信息移到 debug preset 或专用视图
   - 完成定义：Inspector 内容随视图切换动态变化，默认不展示扩展内部状态

6. 底部面板交互增强
   - 加折叠/展开按钮
   - 加面板标签切换（Trace / EventLog / StateDiff / Comments）
   - 完成定义：面板可折叠，可通过标签切换不同面板

7. 节点卡片宽度自适应
   - 根据 configSchema properties 数量选择宽度档位（`w-64` / `w-96` / `w-[480px]`）
   - 完成定义：RunFlow（1 字段）比 PromptBuild（多字段）明显更窄

8. 响应式 Inspector 降级
   - lg-xl 区间（1024-1279px）提供抽屉或浮层模式
   - 完成定义：1024px 宽度下 Inspector 可通过按钮触发展开

**P2 — 依赖 B 提供数据 / API**

9. Lint 内联诊断（依赖：B 确认 diagnostics 中 `location` 字段包含 flowId + nodeId）
   - 在 Flow 画布节点上根据 severity 标红/标黄
   - 点击节点诊断标记跳转到 ProblemsView
   - 完成定义：有 lint 问题的节点在画布上有视觉标记

10. 可视化 Debug 画布高亮（依赖：B 确认 run state 中 currentNodeId 可用）
    - 当前执行节点高亮
    - 已执行节点灰化或打勾
    - 完成定义：debug 运行时画布节点有执行状态视觉反馈

11. Prompt Preview 联动（依赖：现有 `usePromptFragments` hook 已够用，可先做）
    - 选中 PromptBuild 节点时，Prompt Preview 自动定位到对应 fragment
    - 完成定义：选中节点和预览面板联动

12. 节点配置面板优化
    - object/array 类型的 configSchema 提供表单化编辑器
    - 优先覆盖 PromptBuild、ReadState、WriteState 等高频节点
    - 完成定义：高频节点不再需要手写 JSON

### 工作原则

- 不要在前端组件里埋新的事实源。缺 API / store 字段时，给 B 提最小接口需求，格式：`[需求-A→B] 需要 xxx hook/command 返回 yyy 数据`。
- 保持和现有 extension/workbench 架构一致，不绕开 ExtensionSurface / WorkbenchPanels / WorkbenchInspector 自建平行框架。
- 优先交付可见、可验证的界面改进，不做大范围抽象重构。
- 每次交付说明：改了哪些用户可见行为、依赖了哪些现有 hook/command、是否需要 B 补接口。

---

## Prompt B — Engine / 工具链 / 平台契约线

你是项目中的 B，负责 Engine、工具链和平台契约。

### 目标

让 KAL 的运行时能力、Studio 平台内核、CLI、事务/版本语义和工具链更完整、更稳定、更可复用。你负责的是"平台契约层"——数据模型、命令契约、服务边界和开发者工具。

### 文件权限

主要修改（你的主责）：
- `apps/engine/src/*`
- `packages/core/src/*`
- `docs/*`
- `examples/*`
- `apps/studio/src/store/studioStore.ts`
- `apps/studio/src/kernel/hooks.ts`（command contract / store shape / service boundary 部分）
- `apps/studio/src/kernel/registry.tsx`（动态扩展接线、runtime 集成）
- `apps/studio/src/api/*`
- `apps/studio/src/types/*`

默认不改（归 A 主责）：
- `apps/studio/src/App.tsx`、`AppSidebar.tsx`
- `apps/studio/src/components/*`（UI 组件）
- `apps/studio/src/nodes/*`
- `apps/studio/src/index.css`

### 任务优先级（按顺序执行）

**P0 — 立即可做，解除 A 的阻塞 + 基础设施**

1. README 节点数量修正
   - `README.md:280` 和 `README.zh-CN.md:279` 的 "20" 改为 "17"
   - 完成定义：README 与 concepts.md / nodes.md 一致

2. `kal debug --retry/--skip` 补文档
   - 在 `docs/reference/cli.md` 的 debug 章节补上这两个 flag
   - 完成定义：`kal debug --help` 和 cli.md 文档一致

3. CI 配置
   - 添加 `.github/workflows/ci.yml`：pnpm install → typecheck → test
   - 完成定义：PR 提交自动跑 CI，失败阻止合并

4. 确认 diagnostics location 格式（解除 A 的 P2-9 阻塞）
   - 确保 `/api/diagnostics` 返回的每条 diagnostic 包含 `flowId` + `nodeId`（或 `sessionStepId`）
   - 如果当前缺失，补上
   - 完成定义：A 可以用 `diagnostic.flowId + diagnostic.nodeId` 在画布上定位节点

**P1 — 平台契约完善**

5. Config 写入链
   - `ConfigEditor` 从只读升级为可写
   - 接入 `project.write` → transaction → version → diagnostics refresh
   - 暴露 `updateConfig` command 给 A
   - 完成定义：在 Studio 中修改 config 后，改动落盘、版本号递增、diagnostics 自动刷新

6. 扩展系统真实接线
   - 让动态注册的 extensions / views / panels 穿透到 workbench UI
   - 当前 workbench hooks 仍主要消费静态 `OFFICIAL_STUDIO_EXTENSIONS`
   - 完成定义：通过 API 注册的扩展在 sidebar 中可见

7. 版本控制语义补齐
   - `RestorableSnapshot` 和 `compareSnapshot` 扩展到覆盖 config + state
   - 完成定义：checkpoint / restore / diff 覆盖 flows + session + config + state

8. State 变更日志
   - 每次 WriteState 记录 before/after diff
   - 确定记录层级（run trace vs 独立 state log）
   - 完成定义：debug 运行后可查询每步的 state 变更历史

**P2 — 工具链增强**

9. `kal debug --state` snapshot diff
   - 定义稳定输出格式，支持 diff 两个快照
   - 完成定义：`kal debug --state` 输出可读快照，`--diff` 可比较两个快照

10. Eval 跨模型对比
    - `kal eval run` 支持 `--model` 参数
    - 完成定义：可以对同一 prompt 跑多个模型并对比输出

11. Lint 增强
    - 补 message / suggestion 模板
    - 完成定义：lint 输出包含修复建议

**P3 — 文档与示例（填充任务，穿插在等待 review 时做）**

12. dnd-adventure 零 lint 警告
13. CONTRIBUTING.md
14. Design Patterns / Troubleshooting / Custom Nodes Guide
15. npm 发布准备（publishConfig、README badge）

### 工作原则

- 新能力优先沉淀为：Engine API → core/runtime → studioStore command → hook contract → types/schema/docs。不要为了让某个 UI 先跑起来就把语义塞进组件。
- 新增或修改 API / command 时，附最小使用示例，方便 A 接入。格式：`[契约-B→A] 新增 useXxx() hook，返回 { ... }，A 可在 xxx 组件中消费`。
- studioStore.ts 是你的主责文件；大改时把影响面控制在 command/service 边界，不顺手改 UI 排版。
- 每次交付说明：新增/修改了哪些平台契约、哪些 Studio UI 现在可以开始接、是否影响现有 examples/CLI/docs。

---

## 共享协作规则

### 文件归属

| 文件 | 主责 | 另一方权限 |
|------|------|-----------|
| `apps/studio/src/components/*` | A | B 不改 |
| `apps/studio/src/nodes/*` | A | B 不改 |
| `apps/studio/src/index.css` | A | B 不改 |
| `apps/studio/src/App.tsx` | A | B 不改 |
| `apps/studio/src/store/studioStore.ts` | B | A 只读 |
| `apps/studio/src/api/*` | B | A 只读 |
| `apps/studio/src/types/*` | B | A 只读 |
| `apps/studio/src/kernel/hooks.ts` | 共享 | A 加 selector/派生；B 改 command/store contract |
| `apps/studio/src/kernel/registry.tsx` | 共享 | A 改文案/排序；B 改动态接线/runtime |
| `apps/engine/src/*` | B | A 不改 |
| `packages/core/src/*` | B | A 不改 |
| `docs/*`、`examples/*` | B | A 不改 |

### 分支与 PR 策略

- 各自从 `main` 拉分支，命名 `a/xxx` 或 `b/xxx`
- PR 合入 `main` 前需要对方 review（主要看是否越界）
- 共享文件（hooks.ts / registry.tsx）的改动必须在 PR 描述中高亮

### 接口需求格式

A 向 B 提需求：
```
[需求-A→B] Lint 内联诊断
需要：diagnostics 中每条 issue 包含 flowId + nodeId
当前：DiagnosticsPayload 只有 message + severity + source
期望：增加 location: { flowId?: string; nodeId?: string; sessionStepId?: string }
阻塞：A 的 P2-9（画布节点标红）
```

B 向 A 通知新契约：
```
[契约-B→A] Config 写入
新增：useStudioCommands().updateProjectConfig(patch: Partial<ProjectConfig>)
返回：Promise<void>，成功后自动触发 diagnostics refresh
A 可在：ConfigEditor 组件中接入保存按钮
```

### 已知依赖阻塞点

| A 的任务 | 依赖 B 提供 | 状态 |
|----------|------------|------|
| P2-9 Lint 内联诊断 | diagnostics location 字段 | B 的 P0-4 |
| P2-10 Debug 画布高亮 | run state 中 currentNodeId | 待确认是否已有 |
| P2-12 节点配置面板 | configSchema 稳定性 | 待 B 盘点 |
| — | Config 写入 command | B 的 P1-5 |
