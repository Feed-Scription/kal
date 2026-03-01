# Core 设计演进：V1 → V2 → V3 → V4

## 演进脉络

### V1：全功能 SDK

给程序员用的 TypeScript 库。9 个模块各自独立，通过 `KalCore` 入口类组装，中间件链串联一切。设计非常完备 — 三层缓存、向量存储、MCP 协议、内容安全、计费追踪全都有。问题是太重了，像在设计一个通用 AI 基础设施框架，而不是一个游戏引擎。用户需要写大量 TypeScript 代码才能跑起来。

### V2：节点式工作流引擎

把 V1 的编程式 API 转化为 Node + Handler + Flow 的声明式模型。用 JSON 定义工作流，数据通过连线在节点间流动。大幅降低了使用门槛，但矫枉过正 — 把基础设施全砍了。LLM 调用失败没有重试，没有缓存，没有可观测性，出了问题是黑盒。

### V3：节点式引擎 + 透明基础设施

保持 V2 的节点式工作流模型，把 V1 中真正必要的基础设施能力融入引擎内部。重试、缓存、JSON 修复对用户透明自动生效，可观测性通过钩子系统实现。同时补上了 V2 缺失的 NodeContext（自定义节点访问引擎能力）、结构化错误处理、配置分层（全局 → 节点级覆盖）。不急需的能力（MCP、safety、向量存储）明确标注为后续扩展，不堆砌。

### V4：模块化 + 术语统一 + Web UI 契约

在 V3 基础上，V4 做了三件事：

1. **模块化与命名统一**：给出明确的模块名（`node` / `flow` / `state` / `llm`），统一术语（Handler → Handle，可观测性 → Telemetry，钩子 → Hook），建立层间关系说明。
2. **JSON-first 与 Web UI 友好性**：新增 JSON 化约束章节，强调前后端共享 JSON 契约，建议引入 `schemaVersion`，节点注册表可导出为 JSON Manifest。
3. **子 Flow Node 化**：子 Flow 采用顶层 `inputs`/`outputs` 的 Node 化契约，使其可被前端当作固定节点渲染与连线。

一句话概括：V1 什么都有但太重，V2 够轻但太薄，V3 找到平衡，V4 在 V3 基础上为模块化落地和 Web UI 对接做好准备。

## V3 → V4 主要变化

### 新增内容

| 维度 | 说明 |
|---|---|
| 主要模块总览 | 开篇新增四层协作说明（Node 能力层 / Flow 编排层 / State 状态层 / LLM 基础设施保障层）及层间关系 |
| 模块命名 | 明确模块目录名：`node` / `flow` / `state` / `llm` |
| JSON 化约束章节 | 6 条面向 Web UI 的 JSON-first 契约（JSON 表达、固定字段解析、可序列化、Manifest 导出、schemaVersion、子 Flow Node 化） |
| NodeManifest 接口 | 新增 `NodeManifest` 类型定义，供前端动态构建节点面板 |
| 子 Flow Node 化契约 | 子 Flow 顶层直接声明 `inputs`/`outputs`，多出口语义明确（多个 SignalOut 对应不同输出分支） |
| SignalIn 说明 | 补充说明：单个 Flow 通常只有一个 SignalIn，多触发条件由上层路由汇聚 |

### 术语变更

| V3 | V4 | 说明 |
|---|---|---|
| `Handler` / `HandlerDefinition` | `Handle` / `HandleDefinition` | 降低与事件处理器语义冲突，更贴近参数句柄概念 |
| `sourceHandler` / `targetHandler` | `sourceHandle` / `targetHandle` | Edge 字段命名与 Handle 保持一致 |
| 可观测性 / observability | `Telemetry`（遥测） | 名称更短，聚焦运行遥测 |
| 钩子 | `Hook` | 中英命名统一 |
| `/api/observability/...` | `/api/telemetry/...` | API 路径同步更新 |

### 增强内容

| 维度 | V3 | V4 |
|---|---|---|
| 节点契约 | 仅结构定义 | 强调 NodeDefinition 是前后端共享 JSON 契约 |
| Flow 顶层结构 | `nodes` + `edges` | 建议增加 `schemaVersion`，子 Flow 可声明 `inputs`/`outputs` |
| 子 Flow 引用 | 依赖内部 SignalIn/SignalOut 推导 | 顶层 `inputs`/`outputs` + 父 Flow 一致性校验 |
| 自定义 Node 加载 | 自动扫描注册 | 新增建议：导出统一 Node Manifest 供 Web UI 解析 |
| initial_state.json | 结构定义 | 新增强调 JSON 可序列化约束，方便前端直读 |

### 不变项（V3 与 V4 一致）

- 核心四块能力：Node / Flow / State / LLM 基础设施
- 内置节点族（Signal、State、Prompt、Message、Text、Image、Data）整体保留
- 重试、缓存、JSON 修复、错误处理等基础机制
- 自定义 Node 接口（CustomNode + NodeContext）
- Flow DAG 执行模型（事件驱动、并行执行、分支隔离）
- State 全局键值存储（type + value）
- 配置分层（kal_config.json 全局 → 节点级覆盖）
- 引擎生命周期 Hook（Flow/Node/LLM 三级事件）

### V1 能力映射（历史参考）

| V1 模块 | 当前归属 | 说明 |
|---------|---------|------|
| `model` | GenerateText 节点 + kal_config.json | 模型调用封装在节点内部，配置外置 |
| `state` | State 管理类节点 + StateStore | 节点式操作 |
| `prompt` | PromptBuild + Message 节点 | Fragment JSON 定义 |
| `tools` | 未纳入（后续扩展） | MCP、function calling |
| `safety` | 未纳入（后续扩展） | 内容安全过滤 |
| `observe` | 引擎 Hook + Telemetry | 自动记录 |
| `infra/retry` | GenerateText 内置 | 自动重试，支持节点级覆盖 |
| `infra/json-repair` | JSONParse 节点内置 | 自动修复 |
| `infra/cache` | GenerateText 内置（L1） | 内存缓存，L2/L3 后续扩展 |
| `infra/post-processor` | PostProcess 节点 | 后处理管道 |
| `infra/vector-store` | 未纳入（后续扩展） | 语义缓存/语义采样 |

## 迁移清单（从 V3 升级到 V4）

1. **术语替换**
   - `Handler` → `Handle`
   - `HandlerDefinition` → `HandleDefinition`
   - `sourceHandler` / `targetHandler` → `sourceHandle` / `targetHandle`

2. **接口与配置**
   - Flow 文件补充 `schemaVersion`（建议）
   - 子 Flow 文件采用顶层 `inputs`/`outputs`

3. **可观测接口**
   - 访问路径从 `/api/observability/...` 迁移到 `/api/telemetry/...`

4. **前端契约**
   - 以 NodeDefinition + Node Manifest 作为稳定渲染输入
   - 严格执行 JSON 可序列化约束

## Core 能做什么

Core 的本质是一个"用工作流编排 AI 调用并管理游戏状态"的运行时引擎。它能支撑的是这类应用：**游戏逻辑的核心决策由 LLM 驱动，而不是硬编码的规则。**

### 适合的场景

**AI 叙事游戏 / 互动小说**

玩家输入一段话 → ReadState 读取角色状态和历史 → PromptBuild 组装上下文 → GenerateText 生成叙事 → JSONParse 解析结构化输出 → ModifyState 更新世界状态。这是最直接的场景，一条 Flow 就能跑通。

**AI NPC 对话系统**

每个 NPC 一个 Flow，SignalIn 接收玩家对话，ReadState 读取 NPC 记忆和好感度，PromptBuild 注入人设和历史，GenerateText 生成回复，ModifyState 更新关系值。多个 NPC 的 Flow 可以并行执行，共享同一个 State。

**AI 驱动的关卡/内容生成**

Timer 节点定时触发 → 读取当前游戏进度 → LLM 生成新的谜题/敌人/物品 → 写入 State。配合 GenerateImage 节点可以同时生成配图。

**AI 桌游 / 卡牌游戏的裁判**

玩家出牌 → Flow 读取规则和牌面状态 → LLM 判定结果 → 更新分数和手牌。budget 片段控制 token 用量，缓存避免重复判定。

**AI 教育/模拟应用**

不限于游戏。任何需要"读取上下文 → AI 生成响应 → 更新状态 → 循环"的应用都适用。比如 AI 面试模拟、AI 语言学习伙伴、AI 剧本杀主持人。

### 不太适合的场景

- 实时性要求极高的游戏（FPS、MOBA）— LLM 延迟太高
- 纯规则驱动的游戏（象棋、数独）— 不需要 LLM
- 需要复杂 Agent 自主决策链的应用 — 当前没有 function calling / tool use，后续版本才会加

### 总结

Core 解决的核心问题是让开发者用"连节点"的方式编排 AI 调用流程，而不用自己处理 LLM API 的各种脏活（重试、缓存、JSON 修复、状态管理）。它面向的是"AI 是游戏玩法核心"的那类应用。
