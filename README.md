# KAL-AI

KAL-AI 是一个面向 AI 原生游戏与交互应用的 Flow 引擎仓库。

它的核心思路是把应用拆成三层：

- `Flow`：用 JSON 描述 DAG 工作流，负责具体编排
- `Session`：用轻量状态机驱动多轮交互节奏
- `Node`：把状态读写、LLM 调用、子流程复用和业务规则封装成可组合节点

当前仓库已经包含可运行的核心运行时、Engine 宿主、可视化 Editor，以及一个完整的示例游戏。

## 适合做什么

KAL-AI 当前最适合：

- 回合制文字游戏
- AI 驱动的互动叙事
- 带状态推进的 RPG / adventure 原型
- 需要“规则逻辑 + LLM 叙事”混合编排的应用

## 仓库结构

```text
apps/
  engine/   Engine 宿主层，提供 CLI、HTTP API、TUI
  editor/   可视化审查工具，连接 Engine 编辑 Flow / Session

packages/
  core/     核心运行时：Flow、Session、Node、State、LLM 基础设施

examples/
  dnd-adventure/  DND 风格单人冒险示例

docs/
  docs_v5/  当前版本文档
```

## 核心能力

- Flow JSON 运行时：`meta + data` 结构，支持输入输出契约
- 内置节点：State、LLM、Signal、Transform 四类
- SubFlow：把复杂逻辑拆成可复用子流程
- Session 层：`RunFlow / Prompt / Choice / Branch / End`
- 自定义节点：项目可在 `node/` 目录扩展业务规则
- Node manifest：Engine 可导出节点清单，Editor 直接消费
- 多轮交互：`kal play` 基于 Session 运行项目

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 构建 Engine

```bash
pnpm --filter @kal-ai/engine build
```

### 3. 运行示例游戏

需要先提供 LLM 环境变量，例如：

```bash
export OPENAI_API_KEY=your_api_key
export OPENAI_BASE_URL=https://your-openai-compatible-endpoint
```

然后运行：

```bash
node apps/engine/dist/bin.js play examples/dnd-adventure
```

### 4. 启动 Engine 服务

```bash
node apps/engine/dist/bin.js serve examples/dnd-adventure
```

### 5. 启动 Editor

```bash
cd apps/editor
pnpm dev
```

Editor 默认连接 `http://localhost:3000`。

## 示例项目

当前仓库自带示例：

- [examples/dnd-adventure](./examples/dnd-adventure)

这个示例展示了：

- Session 如何驱动角色创建和回合循环
- Flow 如何拆分主编排、叙事子流程、结局流程
- 自定义节点如何承载游戏规则
- State 如何承载角色属性、背包、任务进度和对话历史

## 开发命令

```bash
# 运行测试
pnpm --filter @kal-ai/core test
pnpm --filter @kal-ai/engine test

# 构建
pnpm --filter @kal-ai/core build
pnpm --filter @kal-ai/engine build
pnpm --filter editor build
```

如果你使用 Bun，也可以直接使用根目录脚本：

```bash
bun run build
bun run test
```

## 文档

当前有效文档位于：

- [docs/docs_v5/core.md](./docs/docs_v5/core.md)
- [docs/docs_v5/engine.md](./docs/docs_v5/engine.md)
- [docs/docs_v5/editor.md](./docs/docs_v5/editor.md)

## 当前定位

这个仓库已经能支撑比简单 Demo 更复杂的 AI 游戏原型，但它当前仍然更适合：

- 单人
- 回合制
- 文本主导
- 状态驱动

如果目标是更复杂的 AI 原生游戏，通常的演进方向会是：

- 更强的实体化世界模型
- 更系统的事件/任务/NPC 调度
- 分层记忆与可回放调试
- 更明确的规则层与生成层分工

## Roadmap

下面是当前比较明确的演进方向。

### 近期

- 继续简化示例项目，减少冗余 Flow 和重复状态处理
- 继续收敛 `Session` 的职责，让交互壳和业务 Flow 分层更稳定
- 补充更多面向当前实现的文档，避免设计稿和代码事实脱节

### 中期

- 重构 TUI 分层：把 Session 驱动、状态管理和终端渲染解耦
- 引入基于 Ink 的新版 TUI，提升 `kal play` 的交互体验
- 保留当前 `readline + ANSI` 版本作为 fallback，避免一次性替换带来兼容性风险
- 支持更丰富的终端 UI 能力，例如选择高亮、状态侧栏、帮助面板和滚动输出

### 后续

- 引入更强的实体化世界模型（NPC、地点、物品、任务）
- 建立更系统的事件调度与任务推进机制
- 补强记忆系统，区分短期对话、摘要、世界事实和角色档案
- 加强调试与可观测性，支持执行回放、state diff 和更清晰的运行日志
