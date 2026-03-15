# Engine 模块

Engine 是 KAL 的命令行工具和运行时服务，负责加载项目、执行 Flow、提供 HTTP API。使用 TypeScript 实现。

## 实现状态说明

本文档描述 Engine 模块的完整设计。以下功能标注为**待实现**（基于 Codex review 的建议补充）：

- **Flow 管理 API**：`GET /api/flows`、`GET /api/flows/:id`、`PUT /api/flows/:id`、`DELETE /api/flows/:id`、`POST /api/flows/validate`
- **配置管理 API**：`GET /api/config`、`PUT /api/config`
- **执行事件流 API**：`GET /api/executions/:id/events`、`GET /api/executions/:id/stream`（SSE）
- **State API 语义拆分**：`POST`（创建）与 `PUT`（修改）分离，对齐 Core 的 AddState/ModifyState 语义
- **统一错误模型**：结构化错误响应（含 `code`、`message`、`details[]`），支持 Editor-UI 精准定位
- **configSchema 标准化**：采用标准 JSON Schema 格式（`type`/`properties`/`required`）
- **schemaVersion 字段**：所有 API 响应和 Flow/Config JSON 携带版本字段
- **SubFlow ref 字段**：Core 的 `NodeDefinition` 补充 `ref` 字段（当前为 Editor-UI 层面约定）

已实现的核心功能（参考 docs_v2）：
- CLI 命令（`kal init`、`kal validate`、`kal run`、`kal serve`）
- 基础 HTTP API（项目信息、Flow 触发/状态查询、State 读写、Node 注册表、Telemetry）
- 项目加载流程、热重载、日志输出

## 主要职责

Engine 作为 Core 的运行时容器，承担以下职责：

1. **项目加载**：读取 kal_config.json、initial_state.json、flow/*.json、node/*.ts
2. **Flow 执行**：调度 Core 的 Flow 引擎，处理 SignalIn/SignalOut 事件
3. **HTTP API 服务**：为 Editor-UI 和其他工具提供 RESTful 接口
4. **配置管理**：环境变量替换、配置校验、热重载
5. **日志与监控**：集成 Core 的 Telemetry，输出日志文件

## CLI 命令

### `kal init`

初始化新的 KAL 项目。

```bash
kal init <project-name> [--template <template-name>]
```

**功能：**
- 创建项目目录结构（flow/、node/）
- 生成默认配置文件（kal_config.json、initial_state.json）
- 可选模板：`basic`（默认）、`rpg`、`dialogue`

**示例：**

```bash
kal init my-game
kal init my-rpg --template rpg
```

### `kal validate`

验证项目配置和 Flow 定义。

```bash
kal validate [project-path]
```

**检查项：**
- JSON 格式正确性
- DAG 结构合法性（无循环引用）
- Handle 类型匹配
- State 类型声明一致性
- 子 Flow 引用存在性
- 自定义 Node 加载成功

**输出：**
- 通过：`✓ Validation passed`
- 失败：详细错误列表（文件路径、行号、错误类型）

### `kal run`

运行 KAL 项目（单次执行模式）。

```bash
kal run [project-path] [--flow <flow-file>] [--input <json-string>]
```

**参数：**
- `--flow`：指定要执行的 Flow 文件（默认 `main.json`）
- `--input`：传入 SignalIn 的初始数据（JSON 字符串）

**示例：**

```bash
# 运行默认 Flow
kal run my-game

# 运行指定 Flow 并传入数据
kal run my-game --flow npc-dialogue.json --input '{"playerInput": "你好"}'
```

### `kal serve`

启动 HTTP 服务（持久运行模式）。

```bash
kal serve [project-path] [--port <port>] [--host <host>]
```

**参数：**
- `--port`：端口号（默认 3000）
- `--host`：主机地址（默认 localhost）

**示例：**

```bash
kal serve my-game --port 8080
```

**启动后：**
- HTTP API 可用：`http://localhost:3000/api/*`
- 项目热重载：修改 flow/*.json 或 node/*.ts 后自动重新加载
- 日志输出：`logs/engine.log`、`logs/llm-calls.jsonl`

## HTTP API

### 项目管理

#### `GET /api/project`

获取项目信息。

**响应：**

```json
{
  "schemaVersion": "1.0",
  "name": "my-game",
  "version": "1.0.0",
  "flows": ["main.json", "npc-dialogue.json"],
  "customNodes": ["MyCustomNode"],
  "state": {
    "keys": ["playerName", "score", "inventory"]
  }
}
```

#### `POST /api/project/reload`

重新加载项目（重新扫描 flow/、node/、配置文件）。

**响应：**

```json
{
  "success": true,
  "reloadedAt": "2024-01-01T12:00:00.000Z"
}
```

### 配置管理

#### `GET /api/config`

获取项目配置（kal_config.json）。

**响应：**

```json
{
  "schemaVersion": "1.0",
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

#### `PUT /api/config`

更新项目配置。

**请求体：**

```json
{
  "schemaVersion": "1.0",
  "name": "my-game",
  "version": "1.0.0",
  "engine": { ... },
  "llm": { ... }
}
```

**查询参数：**
- `validateOnly=true`：仅校验不保存（可选）

**响应（成功）：**

```json
{
  "success": true,
  "savedAt": "2024-01-01T12:00:00.000Z",
  "reloadRequired": true
}
```

**响应（失败）：**

```json
{
  "success": false,
  "error": {
    "code": "CONFIG_VALIDATION_ERROR",
    "message": "Configuration validation failed",
    "details": [
      {
        "path": "llm.apiKey",
        "message": "Missing required field"
      },
      {
        "path": "engine.timeout",
        "message": "Must be a positive number"
      }
    ]
  }
}
```

### Flow 管理

#### `GET /api/flows`

获取所有 Flow 列表。

**响应：**

```json
{
  "schemaVersion": "1.0",
  "flows": [
    {
      "id": "main.json",
      "name": "主流程",
      "nodeCount": 8,
      "hasSubFlows": false
    },
    {
      "id": "npc-dialogue.json",
      "name": "NPC 对话",
      "nodeCount": 12,
      "hasSubFlows": true
    }
  ]
}
```

#### `GET /api/flows/:id`

获取指定 Flow 的完整定义。

**响应：**

```json
{
  "schemaVersion": "1.0",
  "nodes": [
    {
      "id": "node1",
      "type": "SignalIn",
      "label": "开始",
      "position": { "x": 100, "y": 100 },
      "inputs": [],
      "outputs": [{ "name": "text", "type": "string" }]
    }
  ],
  "edges": [
    {
      "source": "node1",
      "sourceHandle": "text",
      "target": "node2",
      "targetHandle": "input"
    }
  ]
}
```

#### `PUT /api/flows/:id`

保存/更新 Flow 定义。

**请求体：**

```json
{
  "schemaVersion": "1.0",
  "nodes": [...],
  "edges": [...]
}
```

**响应（成功）：**

```json
{
  "success": true,
  "savedAt": "2024-01-01T12:00:00.000Z"
}
```

**响应（失败）：**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Flow validation failed",
    "details": [
      {
        "type": "TYPE_MISMATCH",
        "nodeId": "node2",
        "edge": { "source": "node1", "target": "node2" },
        "message": "Cannot connect string to number",
        "path": "edges[0]"
      },
      {
        "type": "CIRCULAR_REFERENCE",
        "path": "nodes[3].ref",
        "message": "SubFlow circular reference detected: main.json -> sub.json -> main.json"
      }
    ]
  }
}
```

#### `DELETE /api/flows/:id`

删除 Flow 文件。

**响应：**

```json
{
  "success": true,
  "deletedAt": "2024-01-01T12:00:00.000Z"
}
```

#### `POST /api/flows/validate`

验证 Flow 定义（不保存）。

**请求体：**

```json
{
  "schemaVersion": "1.0",
  "nodes": [...],
  "edges": [...]
}
```

**响应：**

```json
{
  "valid": true,
  "errors": []
}
```

或

```json
{
  "valid": false,
  "errors": [
    {
      "type": "MISSING_NODE",
      "nodeId": "node3",
      "message": "Edge target node 'node3' does not exist",
      "path": "edges[1].target"
    }
  ]
}
```

### Flow 执行

#### `POST /api/flow/trigger`

触发 Flow 执行。

**请求体：**

```json
{
  "flowFile": "main.json",
  "entryNodeId": "input",
  "data": {
    "playerInput": "你好"
  }
}
```

**说明：**
- `entryNodeId`：指定触发的 SignalIn 节点 ID（可选，如果 Flow 只有一个 SignalIn 则自动选择）
- 如果 Flow 有多个 SignalIn 且未指定 `entryNodeId`，返回错误要求明确指定

**响应：**

```json
{
  "executionId": "exec-123",
  "status": "running"
}
```

#### `GET /api/flow/status/:executionId`

查询 Flow 执行状态。

**响应：**

```json
{
  "executionId": "exec-123",
  "status": "completed",
  "startedAt": "2024-01-01T12:00:00.000Z",
  "completedAt": "2024-01-01T12:00:05.000Z",
  "outputs": {
    "output": {
      "text": "你好！我是 AI 助手。"
    }
  },
  "errors": []
}
```

**状态值：**
- `running`：执行中
- `completed`：执行完成
- `failed`：执行失败
- `stopped`：手动停止

#### `POST /api/flow/stop/:executionId`

停止 Flow 执行。

**响应：**

```json
{
  "success": true,
  "stoppedAt": "2024-01-01T12:00:03.000Z"
}
```

### State 管理

State API 的语义与 Core 的 State 管理类节点（AddState / ModifyState / RemoveState / ReadState）保持一致：创建和修改是不同操作，类型检查严格执行。

#### `GET /api/state`

获取所有 State。

**响应：**

```json
{
  "playerName": {
    "type": "string",
    "value": "Player"
  },
  "score": {
    "type": "number",
    "value": 100
  }
}
```

#### `GET /api/state/:key`

获取指定 State。

**响应（存在）：**

```json
{
  "exists": true,
  "type": "string",
  "value": "Player"
}
```

**响应（不存在）：**

```json
{
  "exists": false
}
```

#### `POST /api/state/:key`

创建新 State（对应 Core 的 AddState 语义）。如果 key 已存在，返回错误。

**请求体：**

```json
{
  "type": "string",
  "value": "NewPlayer"
}
```

**响应（成功）：**

```json
{
  "success": true
}
```

**响应（失败 — key 已存在）：**

```json
{
  "success": false,
  "error": {
    "code": "STATE_ALREADY_EXISTS",
    "message": "State key 'playerName' already exists, use PUT to modify"
  }
}
```

#### `PUT /api/state/:key`

修改已有 State（对应 Core 的 ModifyState 语义）。如果 key 不存在或类型不匹配，返回错误。

**请求体：**

```json
{
  "value": "UpdatedPlayer"
}
```

**响应（成功）：**

```json
{
  "success": true
}
```

**响应（失败 — key 不存在）：**

```json
{
  "success": false,
  "error": {
    "code": "STATE_NOT_FOUND",
    "message": "State key 'unknownKey' does not exist, use POST to create"
  }
}
```

**响应（失败 — 类型不匹配）：**

```json
{
  "success": false,
  "error": {
    "code": "STATE_TYPE_MISMATCH",
    "message": "Cannot assign number to state 'playerName' (declared type: string)"
  }
}
```

#### `DELETE /api/state/:key`

删除 State（对应 Core 的 RemoveState 语义）。如果 key 不存在，返回错误。

**响应（成功）：**

```json
{
  "success": true
}
```

**响应（失败）：**

```json
{
  "success": false,
  "error": {
    "code": "STATE_NOT_FOUND",
    "message": "State key 'unknownKey' does not exist"
  }
}
```

#### `POST /api/state/reset`

重置为初始状态（从 initial_state.json 重新加载）。

**响应：**

```json
{
  "success": true,
  "resetAt": "2024-01-01T12:00:00.000Z"
}
```

### Node 注册表

#### `GET /api/nodes`

获取所有可用 Node 类型（内置 + 自定义）。返回 Node Manifest 列表，`configSchema` 采用标准 JSON Schema 格式。

**响应：**

```json
{
  "schemaVersion": "1.0",
  "builtin": [
    {
      "type": "SignalIn",
      "label": "信号输入",
      "category": "signal",
      "inputs": [],
      "outputs": [{ "name": "data", "type": "object" }]
    },
    {
      "type": "GenerateText",
      "label": "生成文本",
      "category": "text",
      "inputs": [{ "name": "messages", "type": "ChatMessage[]", "required": true }],
      "outputs": [
        { "name": "text", "type": "string" },
        { "name": "usage", "type": "object" }
      ],
      "configSchema": {
        "type": "object",
        "required": ["model"],
        "properties": {
          "model": { "type": "string", "description": "模型名称" },
          "temperature": { "type": "number", "default": 0.7, "minimum": 0, "maximum": 2 },
          "maxTokens": { "type": "integer", "default": 1000, "minimum": 1 }
        }
      }
    }
  ],
  "custom": [
    {
      "type": "MyCustomNode",
      "label": "我的自定义节点",
      "category": "custom",
      "inputs": [{ "name": "input1", "type": "string", "required": true }],
      "outputs": [{ "name": "result", "type": "string" }]
    }
  ]
}
```

#### `GET /api/nodes/:type`

获取指定 Node 类型的详细定义。

**响应：**

```json
{
  "type": "GenerateText",
  "label": "生成文本",
  "category": "text",
  "inputs": [
    { "name": "messages", "type": "ChatMessage[]", "required": true }
  ],
  "outputs": [
    { "name": "text", "type": "string" },
    { "name": "usage", "type": "object" }
  ],
  "configSchema": {
    "type": "object",
    "required": ["model"],
    "properties": {
      "model": { "type": "string", "description": "模型名称" },
      "temperature": { "type": "number", "default": 0.7, "minimum": 0, "maximum": 2 },
      "maxTokens": { "type": "integer", "default": 1000, "minimum": 1 }
    }
  }
}
```

### Telemetry（遥测）

#### `GET /api/telemetry/llm-calls`

获取 LLM 调用记录。

**查询参数：**
- `executionId`：过滤指定执行 ID
- `nodeId`：过滤指定节点 ID
- `limit`：返回条数（默认 100）
- `offset`：偏移量（默认 0）

**响应：**

```json
{
  "total": 150,
  "calls": [
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
  ]
}
```

#### `GET /api/telemetry/executions`

获取 Flow 执行历史。

**查询参数：**
- `flowFile`：过滤指定 Flow 文件
- `status`：过滤状态（running/completed/failed/stopped）
- `limit`：返回条数（默认 50）

**响应：**

```json
{
  "total": 200,
  "executions": [
    {
      "executionId": "exec-123",
      "flowFile": "main.json",
      "status": "completed",
      "startedAt": "2024-01-01T12:00:00.000Z",
      "completedAt": "2024-01-01T12:00:05.000Z",
      "durationMs": 5000,
      "nodeCount": 8,
      "llmCallCount": 2,
      "totalTokens": 450
    }
  ]
}
```

### 执行事件流

#### `GET /api/executions/:executionId/events`

获取指定执行的节点级事件列表（用于 Editor-UI 的执行时序图和节点高亮）。事件模型与 Core 的 Hook 系统（`onNodeStart`/`onNodeEnd`/`onNodeError`/`onLLMRequest`/`onLLMResponse`）一一对应。

**查询参数：**
- `nodeId`：过滤指定节点 ID（可选）
- `type`：过滤事件类型（可选，如 `node_start,node_end`）

**响应：**

```json
{
  "executionId": "exec-123",
  "events": [
    {
      "type": "node_start",
      "nodeId": "read1",
      "nodeType": "ReadState",
      "timestamp": "2024-01-01T12:00:00.100Z",
      "inputs": { "key": "playerName" }
    },
    {
      "type": "node_end",
      "nodeId": "read1",
      "nodeType": "ReadState",
      "timestamp": "2024-01-01T12:00:00.105Z",
      "durationMs": 5,
      "outputs": { "value": "Player", "exists": true }
    },
    {
      "type": "node_start",
      "nodeId": "llm1",
      "nodeType": "GenerateText",
      "timestamp": "2024-01-01T12:00:00.200Z",
      "inputs": { "messages": "[...]" }
    },
    {
      "type": "llm_request",
      "nodeId": "llm1",
      "model": "gpt-4",
      "timestamp": "2024-01-01T12:00:00.201Z"
    },
    {
      "type": "llm_response",
      "nodeId": "llm1",
      "model": "gpt-4",
      "timestamp": "2024-01-01T12:00:01.500Z",
      "latencyMs": 1299,
      "cached": false,
      "usage": { "promptTokens": 150, "completionTokens": 80, "totalTokens": 230 }
    },
    {
      "type": "node_end",
      "nodeId": "llm1",
      "nodeType": "GenerateText",
      "timestamp": "2024-01-01T12:00:01.510Z",
      "durationMs": 1310,
      "outputs": { "text": "你好！", "usage": { "totalTokens": 230 } }
    },
    {
      "type": "node_error",
      "nodeId": "parse1",
      "nodeType": "JSONParse",
      "timestamp": "2024-01-01T12:00:01.600Z",
      "error": {
        "code": "EXECUTION_ERROR",
        "message": "Failed to parse JSON: unexpected token at position 42"
      }
    }
  ]
}
```

#### `GET /api/executions/:executionId/stream`（SSE）

实时推送执行事件（Server-Sent Events），用于 Editor-UI 的实时节点高亮和调试。

**事件格式：**

```
event: node_start
data: {"nodeId":"llm1","nodeType":"GenerateText","timestamp":"2024-01-01T12:00:00.200Z"}

event: node_end
data: {"nodeId":"llm1","nodeType":"GenerateText","durationMs":1310,"outputs":{"text":"你好！"}}

event: node_error
data: {"nodeId":"parse1","nodeType":"JSONParse","error":{"code":"EXECUTION_ERROR","message":"..."}}

event: flow_end
data: {"status":"completed","durationMs":5000}
```

**事件类型：**
- `node_start`：节点开始执行
- `node_end`：节点执行完成
- `node_error`：节点执行失败
- `llm_request`：LLM 请求发出
- `llm_response`：LLM 响应返回
- `flow_end`：Flow 执行结束

## 项目加载流程

Engine 启动时的完整加载流程：

```
1. 读取 kal_config.json
   ↓
2. 环境变量替换（${VAR_NAME}）
   ↓
3. 配置校验（必填字段、类型检查）
   ↓
4. 读取 initial_state.json
   ↓
5. 初始化 State Store
   ↓
6. 扫描 flow/*.json
   ↓
7. 解析 Flow 定义（nodes + edges）
   ↓
8. 构建 DAG、检测循环引用
   ↓
9. 扫描 node/*.ts
   ↓
10. 加载自定义 Node（动态 import）
    ↓
11. 注册 Node 到 Core
    ↓
12. Handle 类型匹配校验
    ↓
13. 初始化 LLM 基础设施（重试、缓存、Telemetry）
    ↓
14. 启动 HTTP 服务（如果是 serve 模式）
    ↓
15. 等待信号触发（CLI 输入 / HTTP 请求 / Timer）
```

## 错误处理

### 统一错误模型

所有 HTTP API 的错误响应采用统一的错误信封格式，便于 Editor-UI 精准定位和高亮问题：

```typescript
interface ApiError {
  code: string;           // 错误码（如 "VALIDATION_ERROR"、"STATE_NOT_FOUND"）
  message: string;        // 人类可读的错误描述
  details?: ErrorDetail[];// 详细错误列表（可选，用于批量校验）
}

interface ErrorDetail {
  type: string;           // 错误子类型（如 "TYPE_MISMATCH"、"CIRCULAR_REFERENCE"）
  message: string;        // 具体错误描述
  path?: string;          // JSON 路径（如 "edges[0]"、"llm.apiKey"）
  nodeId?: string;        // 相关节点 ID（如果适用）
  edge?: {                // 相关连线（如果适用）
    source: string;
    target: string;
  };
}
```

**错误码一览：**

| 错误码 | 说明 | 适用 API |
|--------|------|----------|
| `VALIDATION_ERROR` | Flow/Config 校验失败 | PUT /api/flows, POST /api/flows/validate, PUT /api/config |
| `NOT_FOUND` | 资源不存在 | GET /api/flows/:id, GET /api/nodes/:type |
| `STATE_ALREADY_EXISTS` | State key 已存在 | POST /api/state/:key |
| `STATE_NOT_FOUND` | State key 不存在 | PUT /api/state/:key, DELETE /api/state/:key |
| `STATE_TYPE_MISMATCH` | State 值类型不匹配 | PUT /api/state/:key |
| `CONFIG_VALIDATION_ERROR` | 配置校验失败 | PUT /api/config |
| `EXECUTION_ERROR` | Flow 执行错误 | GET /api/flow/status/:executionId |
| `AMBIGUOUS_ENTRY` | 多个 SignalIn 未指定入口 | POST /api/flow/trigger |

### 加载时错误

**配置错误：**
- 缺少必填字段（如 `llm.apiKey`）
- 类型不匹配（如 `engine.timeout` 不是数字）
- 环境变量未设置（如 `${OPENAI_API_KEY}` 未定义）

**Flow 错误：**
- JSON 格式错误
- 循环引用（Flow A → Flow B → Flow A）
- Handle 类型不匹配（如 string 连接到 number）
- 引用的子 Flow 不存在

**Node 错误：**
- 自定义 Node 文件语法错误
- 缺少必需字段（type、inputs、outputs、execute）
- execute 函数不是 async function

**处理方式：**
- 打印详细错误信息（文件路径、行号、错误类型）
- 拒绝启动，退出进程（exit code 1）

### 运行时错误

**Node 执行错误：**
- Node 执行函数抛出异常
- 输出类型与声明不符
- 超时（超过 `engine.timeout`）

**LLM 调用错误：**
- API 密钥无效
- 网络超时
- 达到最大重试次数
- 模型不存在

**State 操作错误：**
- 修改不存在的 State
- 类型不匹配（如修改 string 类型为 number）

**处理方式：**
- 记录错误到日志（`logs/engine.log`）
- 中断当前分支执行
- 其他独立分支继续执行
- 通过 HTTP API 返回错误信息

## 配置文件（kal_config.json）

完整配置示例：

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

**字段说明：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | ✓ | - | 项目名称 |
| `version` | string | ✓ | - | 项目版本 |
| `engine.logLevel` | string | ✗ | `"info"` | 日志级别（debug/info/warn/error） |
| `engine.maxConcurrentFlows` | number | ✗ | `10` | 最大并发 Flow 数 |
| `engine.timeout` | number | ✗ | `30000` | 单个 Node 执行超时（毫秒） |
| `llm.provider` | string | ✓ | - | LLM 提供商（openai/anthropic） |
| `llm.apiKey` | string | ✓ | - | API 密钥（支持环境变量） |
| `llm.defaultModel` | string | ✓ | - | 默认模型名称 |
| `llm.retry.*` | object | ✗ | 见上 | 重试配置 |
| `llm.cache.*` | object | ✗ | 见上 | 缓存配置 |
| `image.provider` | string | ✗ | - | 图像生成提供商 |
| `image.apiKey` | string | ✗ | - | 图像 API 密钥 |

**环境变量替换：**

`${VAR_NAME}` 会在加载时自动替换为环境变量的值。如果环境变量未设置，加载失败。

## 日志输出

Engine 会输出以下日志文件：

### `logs/engine.log`

引擎运行日志（结构化 JSON Lines 格式）。

**示例：**

```json
{"level":"info","timestamp":"2024-01-01T12:00:00.000Z","message":"Engine started","port":3000}
{"level":"info","timestamp":"2024-01-01T12:00:01.000Z","message":"Flow triggered","executionId":"exec-123","flowFile":"main.json"}
{"level":"error","timestamp":"2024-01-01T12:00:02.000Z","message":"Node execution failed","executionId":"exec-123","nodeId":"llm1","error":"API key invalid"}
```

### `logs/llm-calls.jsonl`

LLM 调用记录（由 Core 的 Telemetry 自动写入）。

**示例：**

```json
{"timestamp":"2024-01-01T12:00:00.000Z","executionId":"exec-123","nodeId":"llm1","model":"gpt-4","promptTokens":150,"completionTokens":80,"totalTokens":230,"latencyMs":1234,"cached":false,"success":true}
```

## 热重载

在 `serve` 模式下，Engine 支持热重载：

**监听文件：**
- `flow/*.json`：Flow 定义变更
- `node/*.ts`：自定义 Node 变更
- `kal_config.json`：配置变更
- `initial_state.json`：初始状态变更

**重载行为：**
- 检测到文件变更 → 重新加载 → 校验 → 应用
- 正在执行的 Flow 不受影响（使用旧定义）
- 新触发的 Flow 使用新定义

**失败处理：**
- 如果重载失败（如 JSON 格式错误），保持旧定义不变
- 打印错误日志，不中断服务

## 与 Core 的关系

Engine 是 Core 的运行时容器：

- **Core**：定义 Node/Flow/State 的接口和实现，纯逻辑层
- **Engine**：加载项目、调度 Core、提供 HTTP API，运行时层

**职责分离：**
- Core 不关心文件系统、HTTP、日志
- Engine 不关心 Node 执行逻辑、DAG 调度

**交互方式：**
- Engine 调用 Core 的 `FlowExecutor.execute()`
- Core 通过 Hook 回调通知 Engine（用于日志、Telemetry）

## 设计原则

1. **配置外置**：所有配置通过 kal_config.json 管理，不硬编码
2. **环境变量优先**：敏感信息（API 密钥）通过环境变量传入
3. **快速失败**：加载时严格校验，运行时尽早发现错误
4. **热重载友好**：支持开发时快速迭代，无需重启服务
5. **可观测性**：详细日志、Telemetry、HTTP API 暴露运行状态
6. **容错性**：单个 Node 失败不影响其他独立分支
7. **RESTful API**：HTTP API 遵循 REST 规范，易于集成
