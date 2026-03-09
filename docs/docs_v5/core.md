# Core 模块

**状态：已完成**

Core 是当前仓库里最完整的模块。它已经具备 KAL 的核心运行时能力：定义 Flow JSON、注册 Node、执行 DAG、访问 State、调用 LLM，并通过 Hook 暴露执行事件。

## 当前已实现能力

### 1. Node / Flow / State 基础模型

Core 已定义并导出当前运行时使用的基础类型：

- `HandleDefinition`
- `NodeDefinition`
- `FlowDefinition`
- `KalConfig`
- `StateValue`
- `EngineHooks`

当前接口事实：

- `FlowDefinition` 已支持 `schemaVersion`、`inputs`、`outputs`
- `NodeDefinition` 已支持 `ref`，用于 `SubFlow`
- `StateValue` 采用 `type + value` 的 JSON 结构

这意味着 V4 中提出的 JSON-first 契约，至少在类型层面已经基本落地。

### 2. 内置 Node 体系

当前已实现的内置节点包括：

- 信号类：`SignalIn`、`SignalOut`、`Timer`
- State 类：`AddState`、`RemoveState`、`ReadState`、`ModifyState`
- LLM 类：`PromptBuild`、`Message`、`GenerateText`、`GenerateImage`
- 处理类：`Regex`、`JSONParse`、`PostProcess`、`SubFlow`

这些节点已经可以被注册到 `NodeRegistry`，并由 `FlowExecutor` 执行。

其中 `Message` 节点（消息组装）存在已知设计限制：对话历史（history）需要通过连线外部传入，没有持久化机制，每次 Flow 执行都从零开始。这对多轮对话场景不友好，改进方向见本文档[改进 #4：消息组装重设计](#改进-4消息组装重设计)。

### 3. Flow 校验与执行

当前 Flow 执行链已经成立：

1. `FlowLoader` 解析 JSON
2. 校验节点、句柄、连线和基础类型兼容性
3. `FlowGraph` 构建 DAG 并检测环
4. `Scheduler` 找到可执行节点
5. `FlowExecutor` 并发执行节点并收集结果

当前已实现的执行行为包括：

- `SignalIn` 输入注入
- 无依赖节点并发执行
- 节点级 timeout
- 分支失败隔离
- Flow / Node / LLM 事件 Hook

当前已知限制：

- 执行器隐含假设一个 Flow 只有一个 `SignalIn` 入口，`FlowDefinition.inputs/outputs` 字段未被执行器真正使用（见[改进 #3：Flow 多 Input / 多 Output](#改进-3flow-多-input--多-output)）
- `FlowDefinition` 的 meta 信息（schemaVersion、inputs/outputs）和运行时数据（nodes、edges）混在同一层结构中（见[改进 #5：Flow JSON meta / data 分离](#改进-5flow-json-meta--data-分离)）

### 4. StateStore

当前 State 能力已可用：

- `add`
- `get`
- `modify`
- `upsert`
- `remove`
- `getAll`
- `loadInitialState`

状态类型检查已实现，支持：

- `string`
- `number`
- `boolean`
- `object`
- `array`

### 5. LLM 基础设施

当前已实现的 LLM 相关能力：

- OpenAI-compatible `chat/completions` 调用
- 重试机制
- 内存缓存
- JSON 修复
- Telemetry 内存记录

这也是当前 Core 最贴近 V4 设计目标的部分。对使用者来说，`GenerateText` 节点已经具备“透明基础设施”的雏形。

需要注意的是，当前 Telemetry 只是在内存中收集记录，还不包含自动写入日志文件或通过服务接口暴露的能力。

### 6. Prompt Fragment 系统

当前已实现的 fragment 类型：

- `base`
- `field`
- `when`
- `randomSlot`
- `budget`

已提供：

- TypeScript builder API
- `compose()`
- `estimateTokens()`
- `buildMessages()`

这意味着 V4 中关于 Prompt 片段组合的核心设计已经落地。

当前已知限制：

- `compose()` 忽略 fragment 的 `role` 字段，输出纯文本而非结构化消息（见[改进 #2：Prompt 拼装重构](#改进-2prompt-拼装重构)）
- prompt 无法声明式绑定 State，必须通过 ReadState 节点手动连线（见[改进 #1：Prompt 与 State 绑定](#改进-1prompt-与-state-绑定)）

### 7. Hook 系统

当前已经支持三层 Hook：

- Flow：`onFlowStart`、`onFlowEnd`、`onFlowError`
- Node：`onNodeStart`、`onNodeEnd`、`onNodeError`
- LLM：`onLLMRequest`、`onLLMResponse`

Hook 可以在创建 Core 实例时注册，并在 Flow 执行过程中被触发。

## 部分完成的能力

### 1. SubFlow

**状态：部分完成**

已实现：

- `NodeDefinition.ref`
- `SubFlow` 节点
- 递归加载子 Flow
- 循环引用检测

未实现：

- 父 Flow 与子 Flow `inputs/outputs` 的一致性校验
- 围绕 SubFlow 的更完整接口契约约束

所以目前的 `SubFlow` 更像是“已经能跑的基础能力”，还不是文档里那种完全收敛的 Node 化方案。

### 2. 自定义 Node

**状态：部分完成**

已实现：

- `CustomNode` 接口
- `NodeContext`
- `CustomNodeLoader.loadFromModules()`

未实现：

- 自动扫描项目 `node/*.ts`
- 文件系统级动态加载
- 与项目结构集成的完整加载流程

当前更准确的说法是：Core 已经具备“承载自定义 Node”的接口能力，但还没有形成真正的项目级加载方案。

### 3. NodeManifest

**状态：部分完成**

已实现：

- `NodeRegistry.exportManifests()`
- 输出 `type / label / inputs / outputs`
- `NodeManifest` 类型中已预留 `category` 和 `configSchema` 字段

未实现：

- `exportManifests()` 对 `category`
- `exportManifests()` 对 `configSchema`
- 面向前端动态表单的完整 manifest 规范

也就是说，当前是“类型层已预留，运行时导出尚未填充”。

## 当前明确未完成或不应夸大的内容

以下内容不要再视为“Core 已完成能力”：

- 基于 HTTP API 的能力暴露
- Telemetry 自动写入日志文件
- L2 / L3 缓存
- 流式输出
- MCP / tools / function calling
- Safety filter
- 向量存储
- 缓存预热
- 状态读取缓存

这些内容在 V4 更接近方向性设计，不是当前代码事实。

## 当前限制

### Timer 仅部分可用

`Timer` 的单次触发可用，但 `interval` 模式没有完整落地，当前行为更接近“带警告地执行一次”。

### schemaVersion 是已支持字段，不是强约束机制

当前类型和示例已经支持 `schemaVersion`，但 Core 还没有完整的版本迁移或兼容校验体系。

### 类型系统仍以运行时简化校验为主

当前已实现的是：

- 句柄存在性校验
- 基础类型兼容校验
- State 运行时类型检查

但没有更复杂的 schema 级别验证系统。

## 当前最准确的定位

当前 Core 可以被视为：

- 一个可执行 JSON Flow 的运行时库
- 一个以 Node 为中心的轻量工作流引擎
- 一个已经包含 LLM 基础设施雏形的游戏/互动应用内核

它已经可以支撑示例级和原型级应用，但离完整的”平台化引擎”还有明显距离。

## 下一阶段改进规划

以下改进项来自对实际使用场景的复盘，目标是让 Flow 从”手动连线驱动”进化为”声明式 + 状态驱动”。所有改进项的状态均为**未实现**。

### 改进 #1：Prompt 与 State 绑定

当前 `PromptBuild` 节点的数据来源是 `inputs.data`，通过连线从上游传入。如果 prompt 模板要引用 State 中的值（角色名、场景等），必须先用 `ReadState` 读出来再手动连线。一个需要 5 个 State 值的 prompt 要连 5 条线，Flow 图很快变得复杂。

改进方向：让 `field` fragment 的 `source` 支持 `state.xxx` 前缀，compose 时自动从 StateStore 读取。

预期变化：

- `compose()` 签名接受 `StateStore` 或 state accessor
- `PromptBuild` 通过 `NodeContext.state` 自动注入 State 数据
- 现有显式连线方式保留，作为覆盖或补充

### 改进 #2：Prompt 拼装重构

当前 `compose()` 把所有 fragment resolve 后 `join('\n\n')` 拼成纯文本。Fragment 虽然有 `role` 字段，但 compose 完全忽略了它。这导致 `PromptBuild → Message → GenerateText` 需要三步链路。

改进方向：compose 输出结构化 `ChatMessage[]`，不同 fragment 按 role 分组。

预期变化：

- 新增 `composeMessages()` 函数，输出 `ChatMessage[]`
- 同一 role 的连续 fragment 合并为一条消息
- `PromptBuild` 可直接输出 `messages` 而不只是 `text`
- 现有 `compose()` → `string` 保留向后兼容

### 改进 #3：Flow 多 Input / 多 Output

当前 `FlowExecutor` 只找 `SignalIn` 类型的 entry node 注入 `inputData`，隐含假设一个 Flow 只有一个入口。`FlowDefinition.inputs/outputs` 字段未被执行器真正使用。

改进方向：

- 允许多个 `SignalIn`/`SignalOut`，每个绑定不同通道
- `FlowDefinition.inputs/outputs` 成为真正的接口契约
- 执行器按名称路由输入，按通道收集输出

预期变化：

- `SignalIn`/`SignalOut` 需要 `name` 或 `channel` 配置
- `FlowExecutor.execute()` 的 `inputData` 按通道分发
- SubFlow 的接口契约可在不加载完整 Flow 的情况下确定

### 改进 #4：消息组装重设计

当前 `Message` 节点的 `history` 通过连线传入，没有持久化机制，每次 Flow 执行都从零开始。在游戏场景中，对话历史是不断增长的状态，当前架构无法支撑多轮对话。

改进方向：

- `history` 作为 State 的一部分自动管理
- 每次 LLM 调用后自动追加到 `state.history`
- `system` prompt 从外部输入（连线或 State 绑定）
- `Message` 节点自动从 State 读 history，只需接收当前轮 user 输入

预期变化：

- StateStore 需要支持 `array` 类型的 append 操作
- 新增 history 管理策略：最大轮数、token 预算裁剪
- 多轮对话从”用户手动管理”变成”引擎内置能力”

### 改进 #5：Flow JSON meta / data 分离

当前 `FlowDefinition` 把元信息（schemaVersion、inputs/outputs）和运行时数据（nodes、edges）混在同一层。`NodeDefinition` 里也混了 `position`（编辑器专用）和 `config`（运行时专用）。

改进方向：拆成两层：

- `meta`：schemaVersion、inputs/outputs、名称/描述。回答”这个 Flow 是什么”
- `data`：nodes、edges。回答”这个 Flow 怎么跑”

预期变化：

```ts
interface FlowDefinition {
  meta: FlowMeta;
  data: FlowData;
}

interface FlowMeta {
  schemaVersion: string;
  name?: string;
  description?: string;
  inputs?: HandleDefinition[];
  outputs?: HandleDefinition[];
}

interface FlowData {
  nodes: NodeDefinition[];
  edges: Edge[];
}
```

- Engine 可只读 meta 做校验和索引
- SubFlow 接口契约在 meta 层即可确定
- FlowLoader 和 Editor 的读写逻辑需要适配新结构

### 建议实施顺序

1. Flow JSON meta/data 分离（#5）— 结构性变更，越早做迁移成本越低
2. Flow 多 Input/Output（#3）— SubFlow 可组合性的前提
3. 消息组装重设计（#4）— 多轮对话是游戏场景的刚需
4. Prompt 与 State 绑定（#1）— 依赖 StateStore 的 accessor 设计稳定
5. Prompt 拼装重构（#2）— 可以和 #1 并行，但优先级略低
