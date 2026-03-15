# Editor-UI 模块

Editor-UI 是 KAL 的可视化编辑器，Web 应用，通过浏览器访问，连接 Engine 的 HTTP API 进行操作。使用 TypeScript + React 实现。

## 实现状态说明

本文档描述 Editor-UI 模块的完整设计。以下功能依赖 Engine 侧的待实现 API：

- **Flow 编辑保存**：依赖 `PUT /api/flows/:id`、`POST /api/flows/validate`（Engine 待实现）
- **Flow 列表加载**：依赖 `GET /api/flows`、`GET /api/flows/:id`（Engine 待实现）
- **配置编辑保存**：依赖 `GET /api/config`、`PUT /api/config`（Engine 待实现）
- **实时执行高亮**：依赖 `GET /api/executions/:id/stream`（SSE，Engine 待实现）
- **节点级调试详情**：依赖 `GET /api/executions/:id/events`（Engine 待实现）
- **State 创建/修改分离**：依赖 Engine 的 `POST`（创建）/ `PUT`（修改）语义拆分（Engine 待实现）
- **SubFlow ref 字段**：Editor-UI 层面约定，待 Core 的 `NodeDefinition` 补充 `ref` 字段
- **configSchema 动态表单**：依赖 Engine 返回标准 JSON Schema 格式的 `configSchema`（Engine 待实现）

## 主要职责

Editor-UI 作为 KAL 项目的可视化编辑前端，承担以下职责：

1. **Flow 可视化编辑**：拖拽式节点画布，连线编排 DAG 工作流
2. **State 管理**：查看和编辑游戏状态（initial_state.json + 运行时状态）
3. **项目配置**：表单化编辑 kal_config.json
4. **调试与监控**：实时查看 Flow 执行状态、LLM 调用记录、Node 输入输出

## JSON-first 契约

Editor-UI 与 Engine 之间通过 JSON 契约交互，不依赖后端 TypeScript 实现细节：

1. **Node 渲染**：基于 `NodeDefinition` 的固定字段（`type`、`inputs`、`outputs`、`config`）渲染节点模板
2. **节点面板**：基于 `GET /api/nodes` 返回的 Node Manifest 动态构建节点库
3. **Handle 连线**：基于 `HandleDefinition` 的 `type` 字段做类型匹配校验
4. **子 Flow**：基于子 Flow 顶层的 `inputs`/`outputs` 声明（以及 `NodeDefinition.ref` 字段），将其渲染为固定节点
5. **State 展示**：基于 `StateValue` 的 `type` + `value` 结构渲染状态列表
6. **配置表单**：基于 `configSchema`（标准 JSON Schema）动态生成配置表单
7. **版本化**：所有 API 响应和 Flow/Config JSON 都携带 `schemaVersion` 字段，确保前后端版本兼容

## 页面结构

### Flow 编辑页（主页面）

### State 管理页

```
┌─────────────────────────────────────────────────────┐
│  State 管理                              [重置状态]  │
├──────────┬──────────┬───────────────────┬───────────┤
│  Key     │  Type    │  Value            │  操作     │
├──────────┼──────────┼───────────────────┼───────────┤
│ playerName│ string  │ "Player"          │ 编辑 删除  │
│ score    │ number   │ 0                 │ 编辑 删除  │
│ inventory│ array    │ []                │ 编辑 删除  │
│ gameConfig│ object  │ { difficulty: ... }│ 编辑 删除  │
├──────────┴──────────┴───────────────────┴───────────┤
│                                      [+ 添加 State] │
└─────────────────────────────────────────────────────┘
```

**功能：**
- 查看所有 State 键值（initial_state.json 定义 + 运行时状态）
- 添加新 State（指定 key、type、value）
- 编辑 State 值（类型校验）
- 删除 State
- 重置为初始状态（调用 `POST /api/state/reset`）
- 运行时状态实时刷新（连接 Engine 服务时）

### 项目设置页

**功能：**
- kal_config.json 的表单化编辑（通过 `GET /api/config` 读取、`PUT /api/config` 保存）
- 分区展示：
  - 基本信息（name、version）
  - 引擎设置（logLevel、maxConcurrentFlows、timeout）
  - LLM 配置（provider、defaultModel、retry、cache）
  - 图像配置（provider）
- 保存前可先调用 `PUT /api/config?validateOnly=true` 校验
- 保存后自动触发 Engine 热重载
- 校验失败时高亮问题字段并显示错误信息

### 执行监控页

**功能：**
- Flow 执行历史列表（从 `GET /api/telemetry/executions` 获取）
- 执行详情（从 `GET /api/executions/:id/events` 获取节点级事件）：
  - 节点执行时序图（哪些节点并行、哪些串行，基于 `node_start`/`node_end` 事件时间戳）
  - 每个节点的输入/输出数据（从事件的 `inputs`/`outputs` 字段获取）
  - LLM 调用详情（model、token 用量、耗时、是否缓存命中，从 `llm_request`/`llm_response` 事件获取）
  - 错误信息（从 `node_error` 事件获取，包含 `code` 和 `message`）
- 实时执行状态（通过 `GET /api/executions/:id/stream` SSE 实时推送，正在运行的 Flow 节点高亮）

## 核心交互流程

### Flow 编辑与保存

```
1. 用户在画布上编辑 Flow（添加节点、连线、设置参数）
   ↓
2. Editor-UI 在本地维护 Flow JSON 结构
   ↓
3. 用户点击保存
   ↓
4. Editor-UI 调用 PUT /api/flows/:id 保存 Flow JSON
   ↓
5. Engine 校验 Flow 定义（DAG、类型匹配、子 Flow 引用）
   ↓
6. 校验通过 → 写入 flow/*.json → 返回 { success: true }
   校验失败 → 返回结构化错误（含 nodeId/edge/path）
              → Editor-UI 根据 error.details 精准高亮问题节点/连线
```

**保存前预校验（可选）：**

```
用户编辑中 → Editor-UI 调用 POST /api/flows/validate（不保存）
           → 实时显示校验结果（红色标记问题节点/连线）
```

### Flow 执行与调试

```
1. 用户在画布上点击"运行"
   ↓
2. Editor-UI 调用 POST /api/flow/trigger
   （如果 Flow 有多个 SignalIn，弹窗让用户选择 entryNodeId）
   ↓
3. Engine 返回 executionId，开始执行 Flow
   ↓
4. Editor-UI 连接 GET /api/executions/:id/stream（SSE）
   ↓
5. 收到 node_start 事件 → 画布上高亮正在执行的节点（蓝色）
   收到 node_end 事件 → 节点标记为完成（绿色），显示输出数据
   收到 node_error 事件 → 节点标记为失败（红色），显示错误信息
   收到 llm_response 事件 → 节点上显示 token 用量和耗时
   ↓
6. 收到 flow_end 事件 → 执行结束
   ↓
7. 用户可点击任意节点查看该节点的输入/输出详情
   （数据来自 GET /api/executions/:id/events?nodeId=xxx）
```

### 子 Flow 编辑

```
1. 用户双击 SubFlow 节点
   ↓
2. Editor-UI 读取节点的 ref 字段，调用 GET /api/flows/:ref 加载子 Flow 定义
   ↓
3. 画布切换到子 Flow 内部视图
   ↓
4. 顶部显示面包屑导航（父 Flow > 子 Flow）
   ↓
5. 子 Flow 的 SignalIn/SignalOut 对应外部的 inputs/outputs
   ↓
6. 编辑完成后调用 PUT /api/flows/:ref 保存子 Flow
   ↓
7. 返回父 Flow 视图，SubFlow 节点的 inputs/outputs 自动同步
```

## 与 Engine 的交互

Editor-UI 通过 Engine 的 HTTP API（`kal serve`）进行所有操作：

| 操作 | API |
|------|-----|
| 获取项目信息 | `GET /api/project` |
| 重新加载项目 | `POST /api/project/reload` |
| 获取项目配置 | `GET /api/config` |
| 保存项目配置 | `PUT /api/config` |
| 获取 Flow 列表 | `GET /api/flows` |
| 获取 Flow 定义 | `GET /api/flows/:id` |
| 保存 Flow | `PUT /api/flows/:id` |
| 删除 Flow | `DELETE /api/flows/:id` |
| 验证 Flow（不保存） | `POST /api/flows/validate` |
| 获取节点类型列表 | `GET /api/nodes` |
| 获取节点类型详情 | `GET /api/nodes/:type` |
| 触发 Flow 执行 | `POST /api/flow/trigger` |
| 查询执行状态 | `GET /api/flow/status/:executionId` |
| 停止执行 | `POST /api/flow/stop/:executionId` |
| 获取执行事件列表 | `GET /api/executions/:executionId/events` |
| 实时执行事件流（SSE） | `GET /api/executions/:executionId/stream` |
| 获取所有 State | `GET /api/state` |
| 获取指定 State | `GET /api/state/:key` |
| 创建 State | `POST /api/state/:key` |
| 修改 State | `PUT /api/state/:key` |
| 删除 State | `DELETE /api/state/:key` |
| 重置 State | `POST /api/state/reset` |
| 获取 LLM 调用记录 | `GET /api/telemetry/llm-calls` |
| 获取执行历史 | `GET /api/telemetry/executions` |

## 节点渲染规则

Editor-UI 基于 Node Manifest（`NodeManifest` 接口）渲染节点：

```typescript
interface NodeManifest {
  type: string;
  label: string;
  category?: string;
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  configSchema?: object; // 标准 JSON Schema
}

// 注意：以下 NodeDefinition 是 Editor-UI 层面的扩展约定，
// Core 的 NodeDefinition 目前尚未包含 ref 字段。
// 待 Core 实现 SubFlow ref 字段后，两侧接口将统一。
interface NodeDefinition extends NodeManifest {
  id: string;
  position?: { x: number; y: number };
  config?: Record<string, any>;
  ref?: string; // SubFlow 节点专用，指向子 Flow 文件路径（待 Core 侧补充）
}
```

**渲染规则：**

1. **节点外观**：根据 `category` 决定颜色主题
   - Signal（蓝色）、State（绿色）、Prompt（紫色）、Text（橙色）、Image（粉色）、Data（灰色）、Custom（黄色）
2. **Handle 端口**：左侧为输入 Handle，右侧为输出 Handle
3. **Handle 类型标识**：不同类型用不同颜色/形状标识
4. **Config 表单**：基于 `configSchema`（标准 JSON Schema）自动生成
   - `type: "string"` → 文本框
   - `type: "number"` / `type: "integer"` → 数字输入
   - `type: "boolean"` → 开关
   - `enum` → 下拉选择
   - `minimum` / `maximum` → 输入范围限制
5. **子 Flow 节点**：
   - 显示为带折叠图标的特殊节点
   - 双击可展开（通过 `ref` 字段加载子 Flow）
   - inputs/outputs 从子 Flow 顶层声明读取

## 设计原则

1. **JSON-first**：所有渲染和交互基于 JSON 契约，不依赖后端实现细节
2. **所见即所得**：画布上的节点布局和连线直接对应 Flow JSON 结构
3. **实时校验**：连线时即时检查类型匹配，保存时校验 DAG 合法性
4. **渐进式复杂度**：基础操作（拖拽、连线）零学习成本，高级功能（子 Flow、调试）按需使用
5. **开发者友好**：支持 JSON 源码视图，可直接编辑 Flow JSON
6. **响应式设计**：适配不同屏幕尺寸，面板可折叠/调整大小
