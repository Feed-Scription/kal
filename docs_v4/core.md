# Core 模块

Core 模块是 KAL 引擎的核心，定义了 Node、Flow、State 等基础概念的接口和实现，同时内置了 LLM 调用所需的基础设施能力（重试、缓存、JSON 修复、Telemetry）。使用 typescript 实现。

## 主要模块总览

Core 可以理解为四层协作：

1. **Node（能力层，module名称：node）**：最小执行单元。每个 Node 通过输入/输出 Handle 暴露能力，例如读取状态、构建 Prompt、调用 LLM、解析 JSON。
2. **Flow（编排层，module名称：flow）**：由多个 Node 和 edge 组成的 DAG 工作流，负责定义“哪些节点先执行、哪些并行执行、数据如何流动”；同时 Flow 本身也可作为一个可复用节点被其他 Flow 调用。
3. **State（状态层，module名称：state）**：全局共享的键值存储，负责在执行过程中保存与读取游戏状态，为 Node/Flow 提供可持续的数据上下文。
4. **LLM 基础设施（保障层，module名称：llm）**：围绕模型调用的通用能力，包括重试、缓存、JSON 修复、Telemetry 与错误处理，默认内置并自动生效。

模块关联（层间关系）：
- **Flow → Node**：Flow 负责调度 Node 的执行顺序、并发与数据连线。
- **Node ↔ State**：Node 按权限读取/修改 State，State 为 Flow 执行提供共享上下文。
- **Node → LLM 基础设施**：`GenerateText` 等节点通过基础设施访问模型能力，而不是直接调用底层 SDK。
- **LLM 基础设施 → Flow/Node**：重试、缓存、Telemetry、错误处理作为横切能力作用于节点执行，并回传给 Flow 级运行结果与日志。

典型执行链路：`SignalIn → Flow 调度 Node 执行 → Node 读写 State / 调用 LLM → SignalOut`。

说明：单个 Flow 通常只有一个 `SignalIn` 作为统一入口，但可以有多个 `SignalOut` 作为不同分支的出口（如不同剧情跳转）。`SignalIn` 表示进入当前 Flow 的触发入口；如果存在多个触发条件，可由上层路由后汇聚到同一个 `SignalIn`。

命名约定：Core 文档中的模块英文名统一使用单数形式（如 `Node`、`Flow`、`State`、`Telemetry`、`SubFlow`）。

## JSON 化约束（面向 Web UI）

为支持后续 Web UI，Core 采用 JSON-first 契约：

1. **Node / Flow / State 对外都以 JSON 表达**，前端无需依赖后端 TypeScript 实现细节。
2. **前端按固定字段解析节点**（如 `type`、`inputs`、`outputs`、`config`），并渲染为固定节点模板。
3. **运行时数据必须可 JSON 序列化**，避免 `function`、`undefined`、`symbol`、`bigint`、`Map/Set` 等非 JSON 值进入 Flow/State。
4. **节点注册表需可导出为 JSON Manifest**（内置节点 + 自定义节点），供前端动态构建节点面板与配置表单。
5. **建议引入 `schemaVersion`**（Flow/State/Manifest），确保前后端在版本升级时可兼容迁移。
6. **子 Flow 采用 Node 化契约**（顶层直接声明 `inputs`/`outputs`），使其可被前端当作“固定节点”渲染与连线。

示例（供前端解析的节点元信息）：

```typescript
interface NodeManifest {
  type: string;
  label: string;
  category?: string;
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  configSchema?: Record<string, any>; // JSON Schema
}
```

## Node（节点）

Node 是功能实现的最小单位，通过 Handle（输入/输出句柄）连接形成数据流。

### Node 的结构

Node 在 flow JSON 中的完整结构：

```typescript
interface NodeDefinition {
  id: string;                    // 节点唯一标识
  type: string;                  // 节点类型（如 "SignalIn", "GenerateText"）
  label?: string;                // 显示名称（可选，供上层使用）
  position?: { x: number; y: number };  // 布局坐标（可选，供上层使用）
  inputs: HandleDefinition[];   // 输入 Handle 定义
  outputs: HandleDefinition[];  // 输出 Handle 定义
  config?: Record<string, any>;  // 节点特有配置（如模板内容、正则表达式等）
}
```

该结构同时是前后端共享的节点 JSON 契约：后端负责产出与校验，前端基于该结构稳定渲染节点。

### Handle（句柄）

Handle 是 Node 上的输入/输出句柄，用于连接不同的 Node。

```typescript
interface HandleDefinition {
  name: string;           // Handle 名称（参数名）
  type: string;           // 数据类型
  defaultValue?: any;     // 默认值（仅输入 Handle）
  required?: boolean;     // 是否必需（仅输入 Handle）
}
```

#### 多 Handle 约定（重点）

每个 Node 都可以有**多个输入 Handle**和**多个输出 Handle**；每个 Handle 对应一个明确参数。

- 输入 Handle 对应节点执行时的输入参数
- 输出 Handle 对应节点执行后的输出参数

示例（简化版 `GenerateText`）：

```json
{
  "id": "gen1",
  "type": "GenerateText",
  "inputs": [
    { "name": "prompt", "type": "string", "required": true },
    { "name": "temperature", "type": "number", "defaultValue": 0.7 }
  ],
  "outputs": [
    { "name": "responseText", "type": "string" },
    { "name": "tokenUsage", "type": "number" }
  ]
}
```

上例中，`prompt` 和 `temperature` 是两个输入 Handle；`responseText` 和 `tokenUsage` 是两个输出 Handle。

#### 输入 Handle 的值来源

输入 Handle 的值有两种来源：

1. **默认值（defaultValue）**：在 NodeDefinition 中直接设置固定值
2. **上游连线传入**：通过 edge 从上游节点的输出 Handle 动态传入

当输入 Handle 同时有默认值和连线传入的值时，连线传入的值优先。

这意味着像 State 管理类节点的 `key` 参数，虽然大多数情况下会设置默认值，但它本质上是一个输入 Handle，也可以通过连线动态传入。

#### Handle 类型系统

Handle 支持内置类型和用户自定义类型：

**内置类型：**
- `string`: 字符串
- `number`: 数字
- `boolean`: 布尔值
- `ChatMessage[]`: 聊天消息数组（用于 LLM）
- `ImageUrl`: 图像 URL
- `object`: 任意对象
- `array`: 任意数组

**自定义类型：**
用户可以通过 TypeScript 定义新的类型，在自定义 Node 中使用。

**类型检查：**
连接两个 Handle 时，引擎会检查类型兼容性。输出 Handle 的类型必须与输入 Handle 的类型匹配。

### 内置 Node 类型

#### 信号类

信号类节点作为 flow 的起点和终点，具有完全对应的输入和输出参数。

**SignalIn（信号输入）**
- 作用：flow 的入口点
- 没有输入连接时：作为事件输入口对接引擎层
- 有输入连接时：仅作为数据验证
- 输出：根据具体信号类型定义的数据

**SignalOut（信号输出）**
- 作用：flow 的出口点
- 没有输出连接时：作为事件输出口对接引擎层
- 有输出连接时：仅作为数据验证
- 输入：根据具体信号类型定义的数据

**Timer（计时器）**
- 作用：特殊的信号输入，按时间触发
- 配置：
  - `delay`: 延迟触发（毫秒）
  - `interval`: 间隔触发（毫秒）
- 输出：触发时间戳

#### State 管理类

**AddState（添加状态）**
- 输入：
  - `key`: string - 状态键名（可在节点上直接设置或连线传入）
  - `type`: string - 状态类型（可在节点上直接设置或连线传入）
  - `value`: any - 状态值
- 输出：
  - `success`: boolean - 是否成功

**RemoveState（删除状态）**
- 输入：
  - `key`: string - 状态键名（可在节点上直接设置或连线传入）
- 输出：
  - `success`: boolean - 是否成功

**ReadState（读取状态）**
- 输入：
  - `key`: string - 状态键名（可在节点上直接设置或连线传入）
- 输出：
  - `value`: any - 状态值
  - `exists`: boolean - 是否存在

**ModifyState（修改状态）**
- 输入：
  - `key`: string - 状态键名（可在节点上直接设置或连线传入）
  - `value`: any - 新的状态值
- 输出：
  - `success`: boolean - 是否成功

#### Prompt 构建类

Prompt 采用**片段组合**模式：用 JSON 定义各种 Prompt 片段 → 引擎自动 `compose` 组装 → `resolve(data)` 解析为消息列表。

**设计原则：** Prompt 模块是纯数据变换，不直接读取 State。State 数据由上游节点（如 ReadState）传入。

**片段类型（Fragment）：**

`base` — 静态文本片段：

```json
{ "type": "base", "id": "intro", "content": "你是一个中世纪叙事 AI", "role": "system" }
```

`field` — 从传入数据中提取动态内容：

```json
{
  "type": "field", "id": "history", "role": "user",
  "source": "events",
  "template": "历史事件:\n{{items}}",
  "window": 20,
  "sample": 5,
  "sort": "importance",
  "dedup": ["eventId"]
}
```

- `source`: 数据路径（如 `"events"` → `data.events`）
- `template`: 渲染模板（`{{items}}` 为序列化后的内容）
- `window`/`sample`/`sort`/`dedup`: 可选的窗口、采样、排序、去重

`when` — 条件包含：

```json
{
  "type": "when", "id": "combat-check",
  "condition": "inCombat",
  "fragments": [ { "type": "base", "id": "combat-rules", "content": "战斗规则：..." } ],
  "else": [ { "type": "base", "id": "explore-rules", "content": "探索规则：..." } ]
}
```

- `condition`: 数据路径，按 truthiness 判断（如 `"inCombat"` → `data.inCombat`）

`randomSlot` — 从候选片段中随机选一个：

```json
{
  "type": "randomSlot", "id": "flavor",
  "candidates": [
    { "type": "base", "id": "f1", "content": "风格A：..." },
    { "type": "base", "id": "f2", "content": "风格B：..." }
  ],
  "seed": "random"
}
```

- `seed`: `"random"`（默认，真随机）或固定数字（可复现）

`budget` — Token 预算控制，超出时自动裁剪：

```json
{
  "type": "budget",
  "maxTokens": 2000,
  "strategy": "tail",
  "fragments": [ ... ]
}
```

- `strategy`: `"tail"`（从末尾丢弃，默认）或 `"weighted"`（按权重裁剪）
- `weights`: 各片段权重（`strategy` 为 `"weighted"` 时，key 为片段 id）

**PromptBuild（Prompt 构建节点）**
- 作用：将片段定义解析、组装为一段完整的 prompt 文本
- 配置：
  - `fragments`: Fragment[] - 片段定义列表（JSON 数组）
- 输入：
  - `data`: object - 传入数据（通常来自 ReadState 节点输出）
- 输出：
  - `text`: string - 解析组装后的 prompt 文本
  - `estimatedTokens`: number - 估算 token 数

片段也支持通过 TypeScript API（`base()`/`field()`/`when()`/`randomSlot()`/`budget()`/`compose()`）以编程方式构建。

#### 消息组装类

**Message（组装 Message）**
- 作用：将 prompt 文本和历史对话组装为 ChatMessage[]，供 LLM 消费
- 配置：
  - `format?`: `"xml"` | `"markdown"` - prompt 文本的格式化风格（默认 `"xml"`）
- 输入：
  - `system`: string - 系统消息（通常来自 PromptBuild 输出）
  - `user`: string - 用户消息（通常来自 PromptBuild 输出或上游数据）
  - `history?`: ChatMessage[] - 历史对话消息
- 输出：
  - `messages`: ChatMessage[] - 组装后的消息数组

典型管线：`ReadState → PromptBuild（构建 prompt 文本）→ Message（组装对话结构）→ GenerateText`

#### 文本类

**GenerateText（生成文本）**
- 作用：调用 LLM 生成文本，内置重试、缓存、Telemetry 能力（见「基础设施」章节）
- 配置：
  - `model`: string - 模型名称（引用 kal_config.json 中的模型配置）
  - `temperature`: number - 温度参数
  - `maxTokens`: number - 最大 token 数
  - `retry?`: RetryConfig - 重试配置（不配置则使用全局默认）
  - `cache?`: CacheConfig - 缓存配置（不配置则使用全局默认）
- 输入：
  - `messages`: ChatMessage[] - 输入消息
- 输出：
  - `text`: string - 生成的文本
  - `usage`: object - token 使用情况

**Regex（正则匹配处理）**
- 配置：
  - `pattern`: string - 正则表达式
  - `flags`: string - 正则标志（如 "gi"）
- 输入：
  - `text`: string - 待处理文本
- 输出：
  - `matches`: string[] - 匹配结果
  - `groups`: object - 捕获组

#### 图像类

**GenerateImage（生成图像）**
- 配置：
  - `model`: string - 模型名称
  - `size`: string - 图像尺寸
- 输入：
  - `prompt`: string - 图像描述
- 输出：
  - `imageUrl`: ImageUrl - 生成的图像 URL

#### 数据处理类

**JSONParse（JSON 解析与修复）**
- 作用：基于 JsonRepair 能力解析 LLM 输出的 JSON，容错处理各种常见问题
- 配置：
  - `extractFromCodeBlock?`: boolean - 从 markdown 代码块中提取 JSON（默认 true）
  - `fixCommonErrors?`: boolean - 修复常见错误（如尾逗号、单引号、注释）（默认 true）
  - `fixTruncated?`: boolean - 修复被截断的 JSON（自动补全括号）（默认 true）
- 输入：
  - `text`: string - 待解析的 JSON 字符串
- 输出：
  - `data`: object - 解析后的数据
  - `success`: boolean - 是否成功
  - `error`: string - 错误信息（如果失败）

**PostProcess（后处理管道）**
- 作用：对文本执行自定义后处理链，支持串联多个处理器
- 配置：
  - `processors`: PostProcessorDef[] - 处理器定义列表，按顺序执行
- 输入：
  - `text`: string - 待处理文本
- 输出：
  - `text`: string - 处理后的文本

### 自定义 Node

用户可以通过编写 TypeScript 文件来定义自定义 Node。

#### 自定义 Node 的接口

```typescript
interface CustomNode {
  // Node 元信息
  type: string;
  label: string;

  // Handle 声明
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];

  // 执行函数
  execute: (inputs: Record<string, any>, config: Record<string, any>, context: NodeContext) => Promise<Record<string, any>>;
}
```

#### NodeContext

执行函数接收 `NodeContext`，提供对引擎能力的访问：

```typescript
interface NodeContext {
  // 访问 State
  state: {
    get(key: string): any;
    set(key: string, value: any): void;
    delete(key: string): void;
  };

  // 访问 LLM（带基础设施能力）
  llm: {
    invoke(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse>;
  };

  // 日志
  logger: {
    debug(message: string, meta?: object): void;
    info(message: string, meta?: object): void;
    warn(message: string, meta?: object): void;
    error(message: string, meta?: object): void;
  };

  // 当前执行上下文
  executionId: string;
  nodeId: string;
}
```

#### 示例：自定义 Node

```typescript
// node/MyCustomNode.ts
export default {
  type: 'MyCustomNode',
  label: '我的自定义节点',

  inputs: [
    { name: 'input1', type: 'string', required: true },
    { name: 'input2', type: 'number', defaultValue: 0 }
  ],

  outputs: [
    { name: 'result', type: 'string' }
  ],

  async execute(inputs, config, context) {
    context.logger.info('执行自定义节点', { inputs, config });

    const result = `${inputs.input1} - ${inputs.input2}`;
    return { result };
  }
};
```

#### 自定义 Node 的加载

引擎会自动扫描项目 `node/` 目录下的所有 `.ts` 文件，加载并注册自定义 Node。
加载完成后，建议将节点元信息导出为 JSON Manifest（与内置节点统一格式），供 Web UI 解析为固定节点。

## Flow（工作流）

Flow 是由 Node 组成的有向无环图（DAG），使用 JSON 文件存储。

### Flow 的结构

为保证 Web UI 稳定解析，Flow 文件建议包含 `schemaVersion` 字段，并保持固定顶层结构（`nodes` + `edges`；可复用子 Flow 额外声明 `inputs` + `outputs`）。

```json
{
  "nodes": [
    {
      "id": "node1",
      "type": "SignalIn",
      "label": "开始",
      "position": { "x": 100, "y": 100 },
      "inputs": [],
      "outputs": [
        { "name": "message", "type": "string" }
      ]
    },
    {
      "id": "node2",
      "type": "GenerateText",
      "label": "生成文本",
      "position": { "x": 300, "y": 100 },
      "inputs": [
        { "name": "messages", "type": "ChatMessage[]" }
      ],
      "outputs": [
        { "name": "text", "type": "string" }
      ],
      "config": {
        "model": "gpt-4",
        "temperature": 0.7
      }
    }
  ],
  "edges": [
    {
      "source": "node1",
      "sourceHandle": "message",
      "target": "node2",
      "targetHandle": "messages"
    }
  ]
}
```

### Flow 的执行模型

Flow 采用**事件驱动/响应式**执行模型：

1. **触发起点**：当一个 SignalIn 节点被触发（接收到事件或数据）时，开始执行
2. **数据传播**：
   - 节点执行完成后，将输出数据传递给所有连接的下游节点
   - 当一个节点的所有输入 Handle 都接收到数据时，该节点自动触发执行
3. **并行执行**：没有依赖关系的节点可以并行执行
4. **终止条件**：当数据到达 SignalOut 节点时，该分支的执行结束

#### 执行示例

```
SignalIn (触发)
  → Node A (执行)
    → Node B (等待 A 完成)
    → Node C (等待 A 完成)
      → Node D (等待 B 和 C 都完成)
        → SignalOut (输出)
```

### 子 Flow（Flow 嵌套）

Flow 支持嵌套子 Flow，但不允许循环引用。语义上，子 Flow 对父 Flow 来说就是一个 **Composite Node（组合节点）**。

#### 子 Flow 的引用方式

在 `nodes` 数组中，可以引用子 Flow：

```json
{
  "nodes": [
    {
      "id": "subflow1",
      "type": "SubFlow",
      "label": "子流程",
      "position": { "x": 200, "y": 200 },
      "ref": "sub-flow.json",
      "inputs": [
        { "name": "input", "type": "string" }
      ],
      "outputs": [
        { "name": "output", "type": "string" }
      ]
    }
  ]
}
```

- `ref`: 子 Flow 的文件路径，相对于项目 `flow/` 目录
- 子 Flow 的输入/输出 Handle 由子 Flow 顶层的 `inputs`/`outputs` 定义，父 Flow 按普通 Node 的 Handle 方式连线

#### 子 Flow 的 Node 化契约（方案 A）

为让前端把子 Flow 稳定渲染为固定节点，子 Flow JSON 顶层直接声明 `inputs`/`outputs`，不额外引入 `interface` 字段：

```json
{
  "schemaVersion": "1.0",
  "inputs": [
    { "name": "playerInput", "type": "string", "required": true }
  ],
  "outputs": [
    { "name": "success", "type": "string" },
    { "name": "fallback", "type": "string" }
  ],
  "nodes": [],
  "edges": []
}
```

- `inputs`：对子 Flow 外部暴露的输入 Handle（通常映射到内部 `SignalIn`）
- `outputs`：对子 Flow 外部暴露的输出 Handle（可对应多个 `SignalOut`，用于不同出口分支）
- `outputs[].name` 建议与内部 `SignalOut` 的标识一一对应，便于父 Flow 直接按出口名连线（如 `success`、`fallback`、`timeout`）
- 子 Flow 执行完成时，哪个内部 `SignalOut` 被触发，就向父 Flow 的同名输出 Handle 发出结果
- 父 Flow 中 `SubFlow` 节点若显式写了 `inputs`/`outputs`，应与被引用子 Flow 的声明一致；引擎在加载时做一致性校验

#### 子 Flow 的限制

- 不允许循环引用：Flow A 引用 Flow B，Flow B 不能直接或间接引用 Flow A
- 引擎在加载时会检测循环引用并报错

## State（状态管理）

State 是全局共享的键值存储，用于在 Flow 执行过程中保存和读取游戏状态。

### State 的结构

```typescript
interface StateStore {
  [key: string]: StateValue;
}

interface StateValue {
  type: string;    // 状态类型
  value: any;      // 状态值
}
```

### State 的类型系统

State 支持以下基础类型：

- `string`: 字符串
- `number`: 数字
- `boolean`: 布尔值
- `object`: 对象（任意 JSON 对象）
- `array`: 数组（任意 JSON 数组）

每个 State 键在声明时必须指定类型，运行时会进行类型检查。

### State 的初始化

项目根目录的 `initial_state.json` 定义游戏的初始状态：

```json
{
  "playerName": {
    "type": "string",
    "value": "Player"
  },
  "score": {
    "type": "number",
    "value": 0
  },
  "inventory": {
    "type": "array",
    "value": []
  },
  "gameConfig": {
    "type": "object",
    "value": {
      "difficulty": "normal",
      "language": "zh-CN"
    }
  }
}
```

`initial_state.json` 中的值需要保持 JSON 可序列化，以便前端可直接读取并展示状态快照。

### State 的操作

通过 State 管理类节点（AddState、RemoveState、ReadState、ModifyState）进行操作。

#### 操作规则

1. **AddState**：
   - 如果 key 已存在，操作失败
   - 必须指定 type 和 value

2. **RemoveState**：
   - 如果 key 不存在，操作失败

3. **ReadState**：
   - 如果 key 不存在，返回 `exists: false`

4. **ModifyState**：
   - 如果 key 不存在，操作失败
   - 新值的类型必须与声明的类型匹配

### State 的作用域

State 是全局共享的，所有 Flow 和 Node 都可以访问同一个 State Store。

## 基础设施

Core 模块内置了 LLM 调用所需的基础设施能力，这些能力对用户透明，自动生效。

### 重试机制

**作用：** 处理 LLM API 的临时性失败（网络抖动、限流、服务端错误）

**配置：** 在 `kal_config.json` 中全局配置，或在 GenerateText 节点级别覆盖

```json
{
  "llm": {
    "retry": {
      "maxRetries": 3,
      "initialDelayMs": 1000,
      "maxDelayMs": 30000,
      "backoffMultiplier": 2,
      "jitter": true
    }
  }
}
```

**行为：**
- 遇到可重试错误（5xx、429、网络超时）时自动重试
- 使用指数退避策略（1s → 2s → 4s → ...）
- 添加随机抖动避免雷鸣群效应
- 达到最大重试次数后抛出错误

**节点级覆盖：**

```json
{
  "id": "llm1",
  "type": "GenerateText",
  "config": {
    "model": "gpt-4",
    "retry": {
      "maxRetries": 5
    }
  }
}
```

### 缓存机制

**作用：** 避免重复调用相同的 LLM 请求，节省成本和时间

**配置：** 在 `kal_config.json` 中全局配置

```json
{
  "llm": {
    "cache": {
      "enabled": true,
      "ttl": 3600000,
      "maxEntries": 1000
    }
  }
}
```

**行为：**
- 基于 `(model, messages, temperature, maxTokens)` 生成缓存 key
- 命中缓存时直接返回，不调用 API
- 支持 TTL 过期自动清理
- 内存缓存（L1），未来可扩展持久化缓存（L2）

**节点级覆盖：**

```json
{
  "id": "llm1",
  "type": "GenerateText",
  "config": {
    "model": "gpt-4",
    "cache": {
      "enabled": false
    }
  }
}
```

### JSON 修复

**作用：** 自动修复 LLM 输出的 JSON 格式问题

**能力：**
- 从 markdown 代码块中提取 JSON（`` ```json ... ``` ``）
- 修复尾逗号（`{"a": 1,}`）
- 修复单引号（`{'a': 1}`）
- 移除注释（`// comment` 或 `/* comment */`）
- 修复被截断的 JSON（自动补全缺失的括号）

**使用：** JSONParse 节点内置此能力，无需额外配置

### Telemetry（遥测）

**作用：** 自动记录每次 LLM 调用的详细信息，用于调试、计费、性能分析

**记录内容：**
- 请求参数（model, messages, temperature 等）
- 响应内容（text, usage）
- 执行耗时
- 是否命中缓存
- 错误信息（如果失败）

**访问方式：**

1. **日志文件：** 引擎自动写入 `logs/llm-calls.jsonl`（每行一个 JSON 对象）
2. **HTTP API：** `GET /api/telemetry/llm-calls?executionId=xxx`
3. **上层 UI：** 上层应用可通过 HTTP API 展示执行历史和节点详情

**示例日志：**

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "executionId": "exec-123",
  "nodeId": "llm1",
  "model": "gpt-4",
  "promptTokens": 150,
  "completionTokens": 80,
  "totalTokens": 230,
  "latencyMs": 1234,
  "cached": false,
  "success": true
}
```

### 错误处理

**Node 执行错误：**

当 Node 执行失败时：
1. 记录详细错误信息（类型、消息、堆栈）
2. 中断当前分支的执行
3. 其他独立分支继续执行
4. 错误信息通过 HTTP API 或日志暴露给用户

**错误类型：**

```typescript
interface NodeExecutionError {
  nodeId: string;
  nodeType: string;
  errorType: 'validation' | 'execution' | 'timeout' | 'unknown';
  message: string;
  stack?: string;
  timestamp: number;
}
```

**重试与错误：**
- 重试机制只处理临时性错误（网络、限流、5xx）
- 永久性错误（4xx、类型不匹配、配置错误）不重试，直接失败

## 类型系统总结

KAL 的类型系统贯穿 Handle 和 State：

| 类型 | Handle | State | 说明 |
|------|---------|-------|------|
| `string` | ✓ | ✓ | 字符串 |
| `number` | ✓ | ✓ | 数字 |
| `boolean` | ✓ | ✓ | 布尔值 |
| `object` | ✓ | ✓ | 任意 JSON 对象 |
| `array` | ✓ | ✓ | 任意 JSON 数组 |
| `ChatMessage[]` | ✓ | ✗ | LLM 消息数组（仅 Handle） |
| `ImageUrl` | ✓ | ✗ | 图像 URL（仅 Handle） |
| 自定义类型 | ✓ | ✗ | 用户通过 TS 定义（仅 Handle） |

## 性能优化

### 并行执行

引擎会自动识别没有依赖关系的节点，并行执行以提高性能。

**示例：**

```
SignalIn
  → ReadState (player)
  → ReadState (scene)
    → PromptBuild (等待两个 ReadState 完成)
```

两个 ReadState 节点会并行执行。

### 懒加载

子 Flow 在首次使用时才加载，避免不必要的文件读取。

### 状态缓存

State 的读取操作会缓存结果，减少重复访问的开销。

### 缓存预热

引擎启动时可以预加载常用的 LLM 响应到缓存中（通过配置文件指定）。

## 配置文件（kal_config.json）

```json
{
  "name": "my-game",
  "version": "1.0.0",
  "engine": {
    "logLevel": "info",
    "maxConcurrentFlows": 10,
    "timeout": 30000
  },
  "llm": {
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}",
    "defaultModel": "gpt-4",
    "retry": {
      "maxRetries": 3,
      "initialDelayMs": 1000,
      "maxDelayMs": 30000,
      "backoffMultiplier": 2,
      "jitter": true
    },
    "cache": {
      "enabled": true,
      "ttl": 3600000,
      "maxEntries": 1000
    }
  },
  "image": {
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

**环境变量替换：** `${VAR_NAME}` 会自动替换为环境变量的值。

## 引擎生命周期 Hook

引擎在 Flow 执行过程中提供 Hook 点，用于扩展行为（Telemetry、调试、自定义逻辑）。

### Hook 类型

```typescript
interface EngineHooks {
  // Flow 级别
  onFlowStart?: (event: FlowStartEvent) => void;
  onFlowEnd?: (event: FlowEndEvent) => void;
  onFlowError?: (event: FlowErrorEvent) => void;

  // Node 级别
  onNodeStart?: (event: NodeStartEvent) => void;
  onNodeEnd?: (event: NodeEndEvent) => void;
  onNodeError?: (event: NodeErrorEvent) => void;

  // LLM 调用级别
  onLLMRequest?: (event: LLMRequestEvent) => void;
  onLLMResponse?: (event: LLMResponseEvent) => void;
}
```

### 事件结构

```typescript
interface FlowStartEvent {
  executionId: string;
  flowId: string;
  timestamp: number;
}

interface FlowEndEvent {
  executionId: string;
  flowId: string;
  timestamp: number;
  durationMs: number;
}

interface FlowErrorEvent {
  executionId: string;
  flowId: string;
  error: NodeExecutionError;
  timestamp: number;
}

interface NodeStartEvent {
  executionId: string;
  nodeId: string;
  nodeType: string;
  inputs: Record<string, any>;
  timestamp: number;
}

interface NodeEndEvent {
  executionId: string;
  nodeId: string;
  nodeType: string;
  outputs: Record<string, any>;
  durationMs: number;
  timestamp: number;
}

interface NodeErrorEvent {
  executionId: string;
  nodeId: string;
  nodeType: string;
  error: NodeExecutionError;
  timestamp: number;
}

interface LLMRequestEvent {
  executionId: string;
  nodeId: string;
  model: string;
  messages: ChatMessage[];
  timestamp: number;
}

interface LLMResponseEvent {
  executionId: string;
  nodeId: string;
  model: string;
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  cached: boolean;
  timestamp: number;
}
```

### 使用方式

Hook 通过引擎初始化时注册，或通过 HTTP API 动态注册：

```typescript
// 编程方式（在自定义 Node 或引擎插件中）
engine.hooks.onNodeEnd = (event) => {
  console.log(`节点 ${event.nodeId} 执行完成，耗时 ${event.durationMs}ms`);
};
```

引擎内置的 Telemetry 功能（日志、LLM 调用记录）就是通过这些 Hook 实现的。

## 设计原则总结

1. **节点即能力**：所有功能通过 Node 暴露，上层可编程调用也可接入可视化工具
2. **基础设施透明**：重试、缓存、JSON 修复、Telemetry 自动生效，用户无需手动连线
3. **配置分层**：全局配置（kal_config.json）→ 节点级覆盖（node config），简单场景零配置，复杂场景可精细控制
4. **纯数据变换**：Prompt 模块不直接读 State，数据通过连线传入，保证可测试性
5. **渐进式复杂度**：MVP 只需 SignalIn → GenerateText → SignalOut 三个节点即可运行，高级能力按需启用
6. **可扩展**：自定义 Node 通过 NodeContext 访问引擎全部能力，Hook 系统支持行为扩展
7. **JSON-first**：Node/Flow/State 与节点注册信息优先采用 JSON 契约，保证 Web UI 可解析、可渲染、可迁移
