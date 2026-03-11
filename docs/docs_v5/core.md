# Core 模块

**状态：已完成**

Core 是当前仓库里最完整的模块。它已经具备 KAL 的核心运行时能力：定义 Flow JSON、注册 Node、执行 DAG、访问 State、调用 LLM，并通过 Hook 暴露执行事件。

## 当前已实现能力

### 1. Node / Flow / State 基础模型

Core 已定义并导出当前运行时使用的基础类型：

- `HandleDefinition`
- `NodeDefinition`
- `FlowDefinition`（已拆分为 `FlowMeta` + `FlowData` 两层）
- `KalConfig`
- `StateValue`
- `EngineHooks`

当前接口事实：

- `FlowDefinition` 采用 `{ meta, data }` 两层结构，meta 包含 `schemaVersion`、`inputs`、`outputs`、`name`、`description`，data 包含 `nodes`、`edges`
- `NodeDefinition` 已支持 `ref`，用于 `SubFlow`
- `StateValue` 采用 `type + value` 的 JSON 结构

### 2. 内置 Node 体系

当前已实现的内置节点包括：

- 信号类：`SignalIn`、`SignalOut`、`Timer`
- State 类：`AddState`、`RemoveState`、`ReadState`、`ModifyState`、`ApplyState`
- LLM 类：`PromptBuild`、`Message`、`GenerateText`、`GenerateImage`
- 处理类：`Regex`、`JSONParse`、`PostProcess`、`SubFlow`

所有内置节点均已填充 `category`、`configSchema` 和 `defaultConfig`，可通过 `NodeRegistry.exportManifests()` 导出完整 manifest。

### 3. Flow 校验与执行

当前 Flow 执行链已经成立：

1. `FlowLoader` 解析 JSON，校验 `meta` / `data` 两层结构
2. 校验节点、句柄、连线和基础类型兼容性
3. 校验 `SignalIn`/`SignalOut` 与 `meta.inputs`/`meta.outputs` 的通道一致性
4. `FlowGraph` 构建 DAG 并检测环
5. `Scheduler` 找到可执行节点，支持并发度控制
6. `FlowExecutor` 并发执行节点并收集结果

当前已实现的执行行为包括：

- 多通道 `SignalIn` 输入注入（每个 `SignalIn` 通过 `config.channel` 绑定到 `meta.inputs` 中的一个通道）
- 多通道 `SignalOut` 输出收集（按通道名汇总到 `FlowExecutionResult.outputs`）
- `meta.inputs` 的 `required` 和 `defaultValue` 契约校验
- 无依赖节点并发执行
- 节点级 timeout（带 timer 清理，不泄漏）
- 分支失败隔离
- Flow / Node / LLM 事件 Hook

### 4. StateStore

当前 State 能力已可用：

- `add`
- `get`（返回深拷贝，防止外部修改）
- `modify`
- `upsert`
- `remove`
- `append`（向 array 类型追加单个元素）
- `appendMany`（向 array 类型追加多个元素）
- `getAll`
- `has`
- `clear`
- `loadInitialState`

`ApplyState` 节点提供批量状态回写能力：接收一个 object，遍历其 key-value 对，逐个写回已存在的 state key。支持 `path` 配置从输入中提取子对象（如 `"stateChanges"`），支持 `allowedKeys` 白名单过滤。只修改已存在的 state key，保留原有 type。这解决了 LLM 输出 stateChanges 后无法自动回写 StateStore 的问题。

当前 `ApplyState` 还支持两种简化用法：

- 如果没有传入 `changes`，会自动把所有命名输入打包成待写回对象
- `allowedKeys: []` 视为“不做白名单过滤”，而不是“全部禁止”

状态类型检查已实现，支持：

- `string`
- `number`（含 `isFinite` 校验）
- `boolean`
- `object`
- `array`

JSON 可序列化校验已实现，防止存入不可序列化的值。

### 5. LLM 基础设施

当前已实现的 LLM 相关能力：

- OpenAI-compatible `chat/completions` 调用
- 指数退避重试机制（含 jitter）
- 内存缓存（TTL + maxEntries + LRU 淘汰）
- JSON 修复（代码块提取、注释移除、单引号修复、尾逗号修复、截断修复）
- Telemetry 内存记录（含 JSONL 导出）

需要注意的是，当前 Telemetry 只是在内存中收集记录，还不包含自动写入日志文件或通过服务接口暴露的能力。

`GenerateImage` 当前为 stub 实现，返回 `generated://` 伪 URL，不是真正的图像生成。

### 6. Prompt Fragment 系统

当前已实现的 fragment 类型：

- `base` — 静态文本
- `field` — 动态数据（支持 `state.xxx` 前缀自动从 StateStore 读取，支持 window / sample / sort / dedup）
- `when` — 条件包含（支持 else 分支）
- `randomSlot` — 随机选择（支持 seed）
- `budget` — token 预算控制（支持 tail / weighted 策略）

已提供：

- TypeScript builder API（`base()`, `field()`, `when()`, `randomSlot()`, `budget()`）
- `compose()` — 输出纯文本（向后兼容）
- `composeSegments()` — 输出文本段数组
- `composeMessages()` — 输出结构化 `ChatMessage[]`，按 role 分组合并
- `estimateTokens()` — 粗略 token 估算
- `buildMessages()` — 工具函数，组装 system + history + user 消息
- `formatSection()` — 支持 xml / markdown 格式化

`PromptScope` 接受 `data`（连线传入）和 `state`（StateStore accessor）两种数据源，`PromptBuild` 节点同时输出 `messages`（`ChatMessage[]`）和 `text`（纯文本）。

### 7. 消息组装与对话历史

`Message` 节点已支持从 State 自动读取对话历史：

- 通过 `config.historyKey`（默认 `"history"`）指定 State 中的 history 数组
- 支持 `config.maxHistoryMessages` 裁剪历史长度
- 支持 `config.format`（xml / markdown）格式化 system 和 user 消息
- 支持 `config.summaryKey`，在 history 前插入摘要
- 支持 `context` 输入，用于把动态上下文前置到 user 消息

`GenerateText` 节点已支持自动管理对话历史：

- 每次 LLM 调用后自动将 user 消息和 assistant 回复追加到 `state[historyKey]`
- 如果 history State 不存在，自动创建
- 支持 `config.historyPolicy.maxMessages` 裁剪历史上限
- 支持 `config.assistantPath` 从 JSON 响应中提取真正需要写入 history 的字段
- 支持通过 `historyUserMessage` 输入覆盖默认的 user 消息提取逻辑

多轮对话已从"用户手动管理"变成"引擎内置能力"。

### 8. Hook 系统

当前已经支持三层 Hook：

- Flow：`onFlowStart`、`onFlowEnd`、`onFlowError`
- Node：`onNodeStart`、`onNodeEnd`、`onNodeError`
- LLM：`onLLMRequest`、`onLLMResponse`

Hook 可以在创建 Core 实例时注册，并在 Flow 执行过程中被触发。Hook listener 异常不会阻断主流程（catch 后 console.error）。

### 9. SubFlow

**状态：已完成**

已实现：

- `NodeDefinition.ref` 指向子 Flow
- `SubFlow` 节点通过 `context.flow.execute` 递归执行
- `FlowLoader` 递归加载子 Flow 并检测循环引用
- `FlowLoader.validateSubFlowContract` 校验父 Flow 中 SubFlow 节点的 `inputs/outputs` 与子 Flow `meta.inputs/outputs` 的一致性

### 10. 自定义 Node

**状态：已完成**

已实现：

- `CustomNode` 接口（type / label / category / inputs / outputs / configSchema / defaultConfig / execute）
- `NodeContext`（state / llm / flow / logger / executionId / nodeId）
- `CustomNodeLoader.loadFromModules()` — 从已加载的模块对象注册
- `CustomNodeLoader.loadFromDirectory()` — 扫描目录，递归查找 `.ts` / `.js` 等文件
- `CustomNodeLoader.loadFromProject()` — 从项目根目录的 `node/` 子目录加载
- 通过 esbuild 编译 TypeScript 后以 data URI 动态 import
- 节点有效性校验（`isValidCustomNode`）

### 11. NodeManifest

**状态：已完成**

已实现：

- `NodeRegistry.exportManifests()` 输出完整 manifest
- 包含 `type` / `label` / `category` / `inputs` / `outputs` / `configSchema` / `defaultConfig`
- 所有内置节点均已填充 `category`、`configSchema` 和 `defaultConfig`

### 12. Session 交互层

**状态：已完成**

Core 已实现独立于 DAG Flow 的 Session 状态机层，用于处理交互节奏和流程跳转。

已实现：

- `SessionDefinition` / `SessionStep` 类型
- `runSession()` 异步生成器执行器
- `validateSessionDefinition()` 校验器
- 条件分支解析与执行
- `Prompt` / `Choice` 直接写 state（`stateKey`）
- `Prompt` / `Choice` 调用 Flow（`flowRef + inputChannel`）

当前 Session 的定位是“交互壳”，只保留少量 step：

- `RunFlow`
- `Prompt`
- `Choice`
- `Branch`
- `End`

复杂叙事、静态文案、状态处理建议继续下沉到 Flow，而不是堆在 Session 层。

### 13. ConfigLoader

已实现：

- JSON 解析
- `${ENV_VAR}` 环境变量替换
- 必填字段校验（name / version / llm.provider / llm.apiKey / llm.defaultModel）
- 约束校验（logLevel / maxConcurrentFlows / timeout / retry / cache 各字段）
- 默认值填充

## 当前明确未完成或不应夸大的内容

以下内容不要再视为"Core 已完成能力"：

- Telemetry 自动写入日志文件
- L2 / L3 缓存
- 流式输出
- MCP / tools / function calling
- Safety filter
- 向量存储
- 缓存预热
- 状态读取缓存
- 真正的图像生成（当前 `GenerateImage` 为 stub）

这些内容在 V4 更接近方向性设计，不是当前代码事实。

## 当前限制

### Timer 仅部分可用

`Timer` 的单次触发可用，但 `interval` 模式没有完整落地，当前行为更接近"带警告地执行一次"。

### schemaVersion 是已支持字段，不是强约束机制

当前类型和示例已经支持 `schemaVersion`，但 Core 还没有完整的版本迁移或兼容校验体系。

### 类型系统仍以运行时简化校验为主

当前已实现的是：

- 句柄存在性校验
- 基础类型兼容校验（含 `any` / `object` / `array` 宽松匹配）
- State 运行时类型检查
- Signal 通道与 meta 契约一致性校验
- SubFlow 接口契约校验

但没有更复杂的 schema 级别验证系统。

## 当前最准确的定位

当前 Core 可以被视为：

- 一个可执行 JSON Flow 的运行时库
- 一个以 Node 为中心的轻量工作流引擎
- 一个已经包含 LLM 基础设施和多轮对话能力的 agent 应用内核
- 一个支持声明式 Prompt + State 绑定的 prompt 组装系统

它已经可以支撑示例级和原型级应用，并通过 Engine 模块具备了服务化运行能力。在 agent 是第一公民的架构下，Core 是 agent 生成的 Flow 的执行引擎。
