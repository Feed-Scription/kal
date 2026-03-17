# 双人并行开发 Prompt（Phase 2）

> 基于 2025-03-17 main 分支状态重新规划。Phase 1 的大部分 P0-P2 已完成。

---

## Prompt A — Studio 交互完善 + 内容线

你是项目中的 A，负责 Studio 交互打磨和内容产出。

### 目标

Phase 1 的 UI 基础设施（字体、Tab Bar、Sidebar、Inspector、空状态、响应式）已全部完成。Phase 2 聚焦于：把半成品功能推到可用状态、产出 Showcase 内容、清理文档重复。

### 文件权限

主要修改：
- `apps/studio/src/components/*`
- `apps/studio/src/nodes/*`
- `apps/studio/src/hooks/*`
- `apps/studio/src/Flow.tsx`、`SessionEditor.tsx`
- `apps/studio/src/App.tsx`、`AppSidebar.tsx`
- `apps/studio/src/index.css`
- `examples/*`（Showcase 游戏内容）
- `docs/guides/*`（文档去重后的最终版本）

可读取、可加 selector/派生逻辑：
- `apps/studio/src/kernel/hooks.ts`
- `apps/studio/src/kernel/registry.tsx`

默认不改（归 B 主责）：
- `apps/studio/src/store/studioStore.ts` 的 state shape / command contract
- `apps/studio/src/api/*`、`apps/studio/src/types/*`
- `apps/engine/src/*`、`packages/core/src/*`

### 任务优先级

**P0 — 接通最后一步，无需 B 新增 API**

1. Config 保存按钮接通
   - `ConfigEditor` 中保存按钮从 disabled 改为调用 `useStudioCommands().updateConfig(draft)`
   - 保存成功后清除 dirty 状态，失败显示 toast
   - 完成定义：在 Studio 中修改 config 后点保存，改动落盘

2. 节点配置表单化：PromptBuild fragments
   - 为 `fragments` array 提供专用编辑器（添加/删除/排序 fragment，每个 fragment 展开编辑 id/type/content/role/when）
   - 完成定义：PromptBuild 节点不再需要手写 JSON 编辑 fragments

3. 节点配置表单化：WriteState allowedKeys
   - 为 `allowedKeys` string array 提供 tag-input 式编辑器
   - 完成定义：WriteState 的 allowedKeys 可通过 UI 添加/删除

**P1 — 需要消费 B 提供的新 API**

4. Prompt Preview 最终渲染（依赖 B 的 P1-1）
   - 选中 PromptBuild 节点时，调用 B 提供的 render API 展示最终 prompt
   - 展示 fragment 激活状态和条件命中
   - 完成定义：选中节点后 Prompt Preview 展示渲染后的完整 prompt

5. Smoke 回放集成到 Debug（依赖 B 的 P1-2）
   - 在 DebuggerView 中添加 "Run All" 按钮，调用 B 提供的 smoke-as-run API
   - 完成定义：可以在 Debug 视图中一键跑完整个 session 的 smoke test

**P2 — 内容与清理**

6. 文档去重
   - `docs/custom-nodes.md`、`docs/design-patterns.md`、`docs/troubleshooting.md` 与 `docs/guides/` 下同名文件合并
   - 保留 `docs/guides/` 路径，删除 `docs/` 根目录的重复版本
   - 更新 `docs/README.md` 中的链接
   - 完成定义：每个主题只有一份文档

7. Showcase 游戏
   - 选定题材（推荐 AI 侦探推理），设计文档 → 实现 → playtest
   - 完成定义：`examples/` 下新增一个可玩 15-30 分钟的完整游戏，lint 零警告

8. 自动布局复杂图场景打磨
   - 测试 10+ 节点的 flow 布局效果，调整 barycenter 参数
   - 完成定义：AI 生成的 flow JSON 导入后自动布局合理

### 工作原则

- 缺 API / store 字段时，给 B 提最小接口需求：`[需求-A→B] 需要 xxx`
- 保持和现有 extension/workbench 架构一致
- 每次交付说明：改了什么、依赖了哪些现有 hook/command

---

## Prompt B — Engine 能力补齐 + 发布线

你是项目中的 B，负责 Engine 能力补齐、工具链和发布。

### 目标

Phase 1 的平台契约层已基本完成。Phase 2 聚焦于：为 A 的半成品功能提供缺失的 Engine API、推进 npm 发布、补测试覆盖、收敛 Lint 规则。

### 文件权限

主要修改：
- `apps/engine/src/*`
- `packages/core/src/*`
- `apps/studio/src/store/studioStore.ts`
- `apps/studio/src/kernel/hooks.ts`（command/store contract 部分）
- `apps/studio/src/api/*`
- `apps/studio/src/types/*`
- `docs/*`（格式规范、reference 文档）
- `.github/*`、`scripts/*`

默认不改（归 A 主责）：
- `apps/studio/src/components/*`
- `apps/studio/src/nodes/*`
- `apps/studio/src/index.css`
- `apps/studio/src/App.tsx`、`AppSidebar.tsx`
- `examples/*`（Showcase 游戏内容归 A）

### 任务优先级

**P0 — 解除 A 的阻塞**

1. Prompt render API（解除 A 的 P1-4）
   - 新增 `GET /api/flows/:flowId/render-prompt?nodeId=xxx&state=current`
   - 给定 flow + PromptBuild nodeId + 当前 state，返回渲染后的 messages array 和 fragment 激活状态
   - 暴露 `engineApi.renderPrompt()` 和 `useStudioCommands().renderPrompt()`
   - 完成定义：A 可以调用 API 获取任意 PromptBuild 节点的渲染结果

2. Smoke-as-run 桥接（解除 A 的 P1-5）
   - 新增 `POST /api/runs` 的 `{ mode: 'smoke', inputs: [...] }` 选项
   - 复用 RunManager 生命周期，让 smoke test 产生标准的 run stream events
   - 完成定义：A 可以用现有的 run subscription 机制观察 smoke 执行过程

**P1 — 测试覆盖 + 工具链**

3. 补测试覆盖
   - `scaffold-templates.ts`：验证两个模板生成的文件列表和内容
   - `reference-graph.ts`：验证引用索引构建和搜索
   - `server.ts`：补 config/eval 终端命令的测试
   - 完成定义：新模块有对应测试，CI 覆盖

4. Lint configSchema 收紧
   - 审计 PromptBuild、WriteState、ComputeState 的 configSchema，把过于宽泛的 `type` 定义（如 `operand` 无 type）收紧
   - 新增 lint 规则：`CONFIG_SCHEMA_MISSING_TYPE`（configSchema property 缺少 type 声明）
   - 完成定义：`kal lint` 能检测出 configSchema 中缺少 type 的字段

5. 文档格式规范
   - 定义统一模板（H1 标题、一句话描述、正文、See Also）
   - 应用到所有 `docs/reference/*.md` 和 `docs/guides/*.md`
   - 完成定义：所有公开文档遵循统一格式

**P2 — 发布**

6. npm 首次发布
   - 确认版本号策略（建议 0.1.0）
   - 创建 changeset，执行 `pnpm release`
   - 验证 `npx create-kal-game` 和 `npx @kal-ai/engine` 可用
   - 完成定义：三个包在 npm 上可安装

7. CI 增强
   - 添加 `kal lint examples/dnd-adventure` 到 CI
   - 添加 `pnpm pack --dry-run` 验证到 CI
   - 完成定义：CI 覆盖示例 lint 和包完整性

---

## 共享协作规则

### 文件归属（Phase 2 更新）

| 文件 | 主责 | 另一方权限 |
|------|------|-----------|
| `apps/studio/src/components/*` | A | B 不改 |
| `apps/studio/src/nodes/*` | A | B 不改 |
| `apps/studio/src/hooks/*` | A | B 不改 |
| `apps/studio/src/index.css` | A | B 不改 |
| `apps/studio/src/App.tsx` | A | B 不改 |
| `apps/studio/src/store/studioStore.ts` | B | A 只读 |
| `apps/studio/src/api/*` | B | A 只读 |
| `apps/studio/src/types/*` | B | A 只读 |
| `apps/studio/src/kernel/hooks.ts` | 共享 | A 加 selector/派生；B 改 command/store contract |
| `apps/studio/src/kernel/registry.tsx` | 共享 | A 改文案/排序；B 改动态接线/runtime |
| `apps/engine/src/*` | B | A 不改 |
| `packages/core/src/*` | B | A 不改 |
| `examples/*` | A（内容）/ B（lint/config） | 协商 |
| `docs/guides/*` | A（去重合并）/ B（格式规范） | 协商 |
| `docs/reference/*` | B | A 不改 |

### 接口需求格式

A 向 B 提需求：
```
[需求-A→B] Prompt 渲染 API
需要：给定 flowId + nodeId + state，返回渲染后的 messages 和 fragment 激活状态
当前：无此 API
期望：GET /api/flows/:flowId/render-prompt?nodeId=xxx
阻塞：A 的 P1-4（Prompt Preview 最终渲染）
```

B 向 A 通知新契约：
```
[契约-B→A] Smoke-as-run 模式
新增：POST /api/runs { mode: 'smoke', inputs: [...] }
返回：标准 RunView，可通过 subscribeRun() 观察
A 可在：DebuggerView 中添加 "Run All" 按钮
```

### 已知依赖阻塞点

| A 的任务 | 依赖 B 提供 | B 的对应任务 |
|----------|------------|-------------|
| P1-4 Prompt Preview 最终渲染 | render-prompt API | B P0-1 |
| P1-5 Smoke 回放集成 | smoke-as-run 桥接 | B P0-2 |

### Phase 1 遗留清理

- [ ] 文档去重：`docs/custom-nodes.md` vs `docs/guides/custom-nodes.md`（保留 guides/ 版本）
- [ ] 文档去重：`docs/design-patterns.md` vs `docs/guides/design-patterns.md`（保留 guides/ 版本）
- [ ] 文档去重：`docs/troubleshooting.md` vs `docs/guides/troubleshooting.md`（保留 guides/ 版本）
- [ ] 更新 `docs/README.md` 链接指向 `guides/` 路径
