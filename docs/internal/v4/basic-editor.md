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

## 节点渲染规则

**渲染规则：**

1. **Handle 端口**：左侧为输入 Handle，右侧为输出 Handle
2. **Handle 类型标识**：不同类型用不同颜色/形状标识
3. **Config 表单**：基于 `configSchema`（标准 JSON Schema）自动生成
   - `type: "string"` → 文本框
   - `type: "number"` / `type: "integer"` → 数字输入
   - `type: "boolean"` → 开关
   - `enum` → 下拉选择
   - `minimum` / `maximum` → 输入范围限制
4. **子 Flow 节点**：
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
