# Core 模块

Core 模块是 KAL 引擎的核心，定义了 Node、Flow、State 等基础概念的接口和实现，同时内置了 LLM 调用所需的基础设施能力（重试、缓存、JSON 修复、可观测性）。

## Node（节点）

Node 是功能实现的最小单位，通过 Handler（输入/输出端口）连接形成数据流。

### Node 的结构

Node 在 flow JSON 中的完整结构：

```typescript
interface NodeDefinition {
  id: string;                    // 节点唯一标识
  type: string;                  // 节点类型（如 "SignalIn", "GenerateText"）
  label?: string;                // 显示名称（可选，供上层使用）
  position?: { x: number; y: number };  // 布局坐标（可选，供上层使用）
  inputs: HandlerDefinition[];   // 输入端口定义
  outputs: HandlerDefinition[];  // 输出端口定义
  config?: Record<string, any>;  // 节点特有配置（如模板内容、正则表达式等）
}
```

### Handler（端口）

Handler 是 Node 上的输入/输出端口，用于连接不同的 Node。

```typescript
interface HandlerDefinition {
  name: string;           // 端口名称
  type: string;           // 数据类型
  defaultValue?: any;     // 默认值（仅输入端口）
  required?: boolean;     // 是否必需（仅输入端口）
}
```

#### 输入端口的值来源

输入端口的值有两种来源：

1. **默认值（defaultValue）**：在 NodeDefinition 中直接设置固定值
2. **上游连线传入**：通过 edge 从上游节点的输出端口动态传入

当输入端口同时有默认值和连线传入的值时，连线传入的值优先。

这意味着像 State 管理类节点的 `key` 参数，虽然大多数情况下会设置默认值，但它本质上是一个输入 handler，也可以通过连线动态传入。

#### Handler 类型系统

Handler 支持内置类型和用户自定义类型：

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
连接两个 Handler 时，引擎会检查类型兼容性。输出端口的类型必须与输入端口的类型匹配。

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
- 作用：调用 LLM 生成文本，内置重试、缓存、可观测能力（见「基础设施」章节）
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

  // Handler 声明
  inputs: HandlerDefinition[];
  outputs: HandlerDefinition[];

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

## Flow（工作流）

Flow 是由 Node 组成的有向无环图（DAG），使用 JSON 文件存储。

### Flow 的结构

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
      "sourceHandler": "message",
      "target": "node2",
      "targetHandler": "messages"
    }
  ]
}
```

### Flow 的执行模型

Flow 采用**事件驱动/响应式**执行模型：

1. **触发起点**：当一个 SignalIn 节点被触发（接收到事件或数据）时，开始执行
2. **数据传播**：
   - 节点执行完成后，将输出数据传递给所有连接的下游节点
   - 当一个节点的所有输入端口都接收到数据时，该节点自动触发执行
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

Flow 支持嵌套子 Flow，但不允许循环引用。

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
- 子 Flow 的输入/输出端口由其内部的 SignalIn/SignalOut 节点定义

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

### 可观测性

**作用：** 自动记录每次 LLM 调用的详细信息，用于调试、计费、性能分析

**记录内容：**
- 请求参数（model, messages, temperature 等）
- 响应内容（text, usage）
- 执行耗时
- 是否命中缓存
- 错误信息（如果失败）

**访问方式：**

1. **日志文件：** 引擎自动写入 `logs/llm-calls.jsonl`（每行一个 JSON 对象）
2. **HTTP API：** `GET /api/observability/llm-calls?executionId=xxx`
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

KAL 的类型系统贯穿 Handler 和 State：

| 类型 | Handler | State | 说明 |
|------|---------|-------|------|
| `string` | ✓ | ✓ | 字符串 |
| `number` | ✓ | ✓ | 数字 |
| `boolean` | ✓ | ✓ | 布尔值 |
| `object` | ✓ | ✓ | 任意 JSON 对象 |
| `array` | ✓ | ✓ | 任意 JSON 数组 |
| `ChatMessage[]` | ✓ | ✗ | LLM 消息数组（仅 Handler） |
| `ImageUrl` | ✓ | ✗ | 图像 URL（仅 Handler） |
| 自定义类型 | ✓ | ✗ | 用户通过 TS 定义（仅 Handler） |

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

## 引擎生命周期钩子

引擎在 Flow 执行过程中提供钩子点，用于扩展行为（可观测性、调试、自定义逻辑）。

### 钩子类型

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

钩子通过引擎初始化时注册，或通过 HTTP API 动态注册：

```typescript
// 编程方式（在自定义 Node 或引擎插件中）
engine.hooks.onNodeEnd = (event) => {
  console.log(`节点 ${event.nodeId} 执行完成，耗时 ${event.durationMs}ms`);
};
```

引擎内置的可观测性功能（日志、LLM 调用记录）就是通过这些钩子实现的。

## 与 V1 能力的对应关系

以下说明 V1 中各基础设施模块在 V3 中的归属：

| V1 模块 | V3 归属 | 说明 |
|---------|---------|------|
| `model` | GenerateText 节点 + kal_config.json | 模型调用封装在节点内部，配置外置 |
| `state` | State 管理类节点 + StateStore | 保持 V2 的节点式操作 |
| `prompt` | PromptBuild + Message 节点 | 保持 V2 的 Fragment JSON 定义 |
| `tools` | 未纳入（后续扩展） | MCP、function calling 作为后续版本 |
| `safety` | 未纳入（后续扩展） | 内容安全过滤作为后续版本 |
| `observe` | 引擎钩子 + 可观测性 | 自动记录，无需用户配置 |
| `infra/retry` | GenerateText 内置 | 自动重试，支持节点级覆盖 |
| `infra/json-repair` | JSONParse 节点内置 | 自动修复 |
| `infra/cache` | GenerateText 内置（L1） | 内存缓存，L2/L3 后续扩展 |
| `infra/post-processor` | PostProcess 节点 | 保持 V2 设计 |
| `infra/vector-store` | 未纳入（后续扩展） | 语义缓存/语义采样后续版本 |

## 设计原则总结

1. **节点即能力**：所有功能通过 Node 暴露，上层可编程调用也可接入可视化工具
2. **基础设施透明**：重试、缓存、JSON 修复、可观测性自动生效，用户无需手动连线
3. **配置分层**：全局配置（kal_config.json）→ 节点级覆盖（node config），简单场景零配置，复杂场景可精细控制
4. **纯数据变换**：Prompt 模块不直接读 State，数据通过连线传入，保证可测试性
5. **渐进式复杂度**：MVP 只需 SignalIn → GenerateText → SignalOut 三个节点即可运行，高级能力按需启用
6. **可扩展**：自定义 Node 通过 NodeContext 访问引擎全部能力，钩子系统支持行为扩展
