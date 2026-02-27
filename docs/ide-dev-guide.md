# KAL-AI IDE 开发文档

## Context

KAL-AI IDE 是面向 AI 游戏开发的集成开发环境，基于 Web 技术栈构建。核心特点是 **Agent First**：用户通过与 AI Agent 对话来驱动开发，IDE 的可视化界面主要用于展示 Agent 的工作成果。

**核心理念**：
- **Agent 驱动**：对话是主要交互方式，Agent 理解需求并自动操作
- **实时可视化**：IDE 实时展示 Agent 创建的 Flow、代码、调试信息
- **能力分离**：Kal 提供核心能力（通过 MCP），IDE 负责可视化和用户交互

**IDE 与 Kal 的关系**：
- **IDE 的 Agent 模块用 Kal 实现**：Agent 本身是一个 Kal 应用，使用 `@kal-ai/core` 的 Model、Tools 等能力
- **Kal devkit 通过 MCP 提供能力**：FlowEditor、Simulator、Replayer 等作为 MCP Server 暴露给 Agent
- **Agent 通过 MCP 调用 Kal 能力**：Agent 的工具（如 add_node、run_simulation）实际是 MCP 工具调用

技术栈：React + TypeScript + Monaco Editor + React Flow + Vite + Kal (MCP Server)

**参考实现**：本文档参考了 Claude Code CLI v2.1.62 的架构设计和最佳实践。

## 一、架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      KAL-AI IDE (Web)                        │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (React)                                            │
│  ├── Chat Interface (主交互界面 - Agent 对话)                │
│  │   ├── 流式响应显示 (SSE)                                  │
│  │   ├── 工具调用可视化                                      │
│  │   └── 多行输入 + 快捷键                                   │
│  ├── Layout Manager (面板布局、拖拽调整)                      │
│  ├── Flow Canvas (可视化 Flow - 展示 Agent 成果)             │
│  │   ├── 实时节点更新 + 动画                                 │
│  │   └── 手动编辑支持                                        │
│  ├── Code Editor (Monaco Editor - 展示生成的代码)            │
│  │   ├── TypeScript 支持                                    │
│  │   └── Diff 显示                                          │
│  ├── Debugger (调试器 + 回放器 - 展示测试结果)                │
│  ├── State Inspector (状态检查器)                            │
│  └── Context Panel (项目上下文、文件树)                       │
├─────────────────────────────────────────────────────────────┤
│  Agent Layer (基于 Kal 实现 - 参考 Claude Code)              │
│  ├── Kal Agent Core (@kal-ai/core)                          │
│  │   ├── Model (Claude API + Streaming)                     │
│  │   ├── Tools (MCP Client)                                 │
│  │   ├── Context Manager (上下文压缩、Token 计数)            │
│  │   └── Permission System (权限管理)                        │
│  ├── MCP Client (连接 Kal devkit MCP Server)                │
│  │   ├── Tool Registry (工具注册)                            │
│  │   ├── Event Emitter (事件通知)                            │
│  │   └── Connection Manager (连接管理)                       │
│  ├── Streaming Handler (SSE 流式处理)                        │
│  │   ├── message_start/stop                                 │
│  │   ├── content_block_delta                                │
│  │   └── tool_use 事件                                       │
│  └── Event Bus (Agent 操作 → UI 更新)                       │
├─────────────────────────────────────────────────────────────┤
│  State Management (Zustand)                                 │
│  ├── Agent State (对话历史、工具调用、流式状态)               │
│  ├── Project State (当前项目、文件树)                         │
│  ├── Editor State (节点、连线、选择)                          │
│  ├── Debug State (断点、执行状态、录制)                       │
│  └── UI State (面板可见性、主题)                              │
├─────────────────────────────────────────────────────────────┤
│  MCP Server (Kal devkit 提供)                               │
│  ├── FlowEditor Tools (create_flow, add_node, etc.)         │
│  ├── Simulator Tools (run_simulation, etc.)                 │
│  ├── Replayer Tools (replay_recording, etc.)                │
│  ├── Inspector Tools (inspect_state, add_assertion, etc.)   │
│  └── Project Tools (list_flows, read_file, etc.)            │
├─────────────────────────────────────────────────────────────┤
│  Kal Core Libraries (能力层 - 无 UI)                         │
│  ├── @kal-ai/devkit (FlowEditor, Simulator, Replayer)       │
│  ├── @kal-ai/orchestrate (FlowExecutor, NodeTypeRegistry)   │
│  └── @kal-ai/core (KalCore, StateManager, Model)            │
├─────────────────────────────────────────────────────────────┤
│  Backend Services (Optional)                                 │
│  ├── File System API (浏览器本地文件访问)                     │
│  ├── Git Integration (isomorphic-git)                        │
│  └── AI Proxy (API Key 安全代理)                             │
└─────────────────────────────────────────────────────────────┘
```

**关键设计点**（参考 Claude Code 架构）：

1. **Agent 基于 Kal 实现**：
   - 使用 `@kal-ai/core` 的 Model 调用 Claude API（支持流式响应）
   - 使用 `@kal-ai/core` 的 Tools 注册和调用 MCP 工具
   - Agent 本质是一个 Kal 应用
   - 实现类似 Claude Code 的异步处理架构（大量 async/await）

2. **MCP 协议连接**：
   - Kal devkit 作为 MCP Server 运行（stdio 或 SSE 传输）
   - IDE 的 Agent 作为 MCP Client 连接
   - 所有 Flow 编辑、调试、测试能力通过 MCP 暴露
   - 支持工具注册、事件通知、状态同步

3. **流式架构**（参考 Claude Code SSE 实现）：
   - 使用 Server-Sent Events (SSE) 实现实时响应
   - 支持 message_start、content_block_delta、tool_use 等事件
   - 实时显示 Agent 输出，提升用户体验
   - 支持长时间运行的任务

4. **双向通信**：
   - Agent → MCP Server：调用工具（add_node、run_simulation 等）
   - MCP Server → Agent：返回结果、触发事件（通过 MCP notifications）
   - Agent → UI：通过 Event Bus 触发 UI 更新

5. **权限管理**（参考 Claude Code 权限系统）：
   - 支持多级权限模式（auto、prompt、allowed-prompts、custom）
   - 工具调用前进行权限检查
   - 用户可配置允许的工具和操作

6. **上下文管理**（参考 Claude Code 优化策略）：
   - Token 计数和监控
   - 自动上下文压缩（接近限制时触发）
   - Prompt Caching 支持（节省成本）
   - 对话历史持久化

### 1.2 模块划分

| 模块 | 职责 | 技术选型 | 与 Kal 的关系 |
|------|------|----------|--------------|
| `chat-interface` | Agent 对话界面 | React + Streaming | 展示 Kal Agent 的对话 |
| `layout` | 面板布局管理 | react-mosaic-component | 展示 Agent 操作结果的容器 |
| `flow-canvas` | 可视化 Flow | React Flow | 实时显示 MCP 工具创建的节点 |
| `code-editor` | 代码编辑器 | Monaco Editor | 显示 MCP 工具生成的代码 |
| `debugger` | 断点调试、回放 | React | 显示 MCP Simulator/Replayer 结果 |
| `state-inspector` | 游戏状态可视化 | React | 显示 MCP 工具检查的状态 |
| `context-panel` | 项目上下文 | File System Access API | 为 Agent 提供项目信息 |
| `agent-core` | AI Agent 引擎 | @kal-ai/core + MCP Client | Kal Agent 实现 |
| `mcp-server` | Kal 能力服务 | @kal-ai/devkit (MCP Server) | 提供所有 Flow 操作能力 |

### 1.3 数据流（参考 Claude Code 工作流程）

```
用户输入
  ↓
Chat Interface (解析输入)
  ↓
Kal Agent (@kal-ai/core)
  ↓
构建 API 请求 (messages + tools + system prompt)
  ↓
发送到 Claude API (流式请求)
  ↓
接收 SSE 流式响应
  ↓
┌─────────────────────────────────────┐
│ 解析流式事件                         │
│ ├── message_start → 初始化消息       │
│ ├── content_block_start → 开始内容块 │
│ ├── content_block_delta → 增量更新   │
│ │   ├── text_delta → 显示文本        │
│ │   └── tool_use → 准备工具调用      │
│ ├── content_block_stop → 完成内容块  │
│ └── message_stop → 消息完成          │
└─────────────────────────────────────┘
  ↓
工具调用？
  ├── 是 → 权限检查
  │        ↓
  │      MCP Client (调用工具)
  │        ↓
  │      MCP Server (Kal devkit)
  │        ↓
  │      FlowEditor / Simulator / Replayer
  │        ↓
  │      返回 tool_result
  │        ↓
  │      添加到对话历史
  │        ↓
  │      继续对话 (发送新请求) ──┐
  │                              │
  └── 否 → 显示响应              │
                                 │
  ↓                              │
Event Bus 触发 UI 更新 ←─────────┘
  ↓
Flow Canvas / Code Editor / Debugger 更新显示
  ↓
上下文管理 (Token 计数、缓存优化、自动压缩)
```

## 二、核心功能设计

### 2.1 Chat Interface（主交互界面）

**功能清单**：
- 对话历史展示（用户消息、Agent 响应、工具调用）
- 流式响应（实时显示 Agent 输出，参考 Claude Code SSE 实现）
  - 支持 text_delta 增量显示
  - 支持 tool_use 事件可视化
  - 支持中断执行
- 工具调用可视化（卡片展示工具名称、参数、结果）
- 多行输入、快捷键支持
- 中断执行、重新生成
- 上下文提示（当前 Flow、选中节点）
- Token 用量显示（input/output/cached tokens）

**流式响应实现**（参考 Claude Code）：
```typescript
// SSE 事件处理
async function handleStreamResponse(stream: ReadableStream) {
  for await (const event of stream) {
    switch (event.type) {
      case 'message_start':
        initializeMessage(event)
        break
      case 'content_block_start':
        if (event.content_block.type === 'text') {
          startTextBlock()
        } else if (event.content_block.type === 'tool_use') {
          startToolUseBlock(event.content_block)
        }
        break
      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          displayText(event.delta.text) // 实时显示
        }
        break
      case 'content_block_stop':
        finalizeContentBlock()
        break
      case 'message_delta':
        updateUsageStats(event.usage) // 更新 Token 统计
        break
      case 'message_stop':
        finalizeMessage()
        break
    }
  }
}
```

**与其他面板的联动**：
- Agent 调用 `add_node` → Flow Canvas 显示新节点（高亮动画）
- Agent 调用 `create_handler` → Code Editor 打开新文件
- Agent 调用 `run_simulation` → Debugger 显示执行过程
- 用户在 Canvas 选中节点 → Chat 输入框显示上下文提示

### 2.2 Flow Canvas（可视化 Flow）

基于 React Flow + `@kal-ai/devkit` 的 FlowEditor。

**功能清单**：
- 实时显示 Agent 创建的节点和连线
- 节点出现动画、连线动画
- 支持手动操作（拖拽、连线、编辑）
- 节点高亮（Agent 正在操作的节点）
- 端口类型可视化（颜色区分）
- 校验错误提示（环检测、端口不匹配）
- 自动布局

**Agent 操作映射**：
- `add_node` → 在指定位置创建节点，播放出现动画
- `connect_nodes` → 绘制连线动画
- `update_node` → 节点闪烁提示已更新
- `remove_node` → 节点淡出动画
- `auto_layout` → 节点平滑移动到新位置

### 2.3 Code Editor（代码编辑器）

基于 Monaco Editor。

**功能清单**：
- 显示 Agent 生成的 handler 代码
- TypeScript 语法高亮、类型检查
- 智能补全（基于 @kal-ai 类型定义）
- 代码 diff 显示（Agent 修改前后对比）
- 多文件 Tab 切换
- 格式化（Prettier）

**Agent 操作映射**：
- `create_handler` → 创建新文件，自动打开
- `update_handler` → 显示 diff，高亮修改部分
- `read_file` → 在 Chat 中显示文件内容摘要

### 2.4 Debugger（调试与回放）

基于 `@kal-ai/devkit` 的 Simulator 和 Replayer。

**功能清单**：
- 执行控制（运行、暂停、停止、单步）
- 状态检查器（实时查看 State）
- 节点输出查看
- Token 用量统计
- 录制回放（时间轴、速度控制）
- 性能分析（节点耗时、缓存命中率）

**Agent 操作映射**：
- `run_simulation` → 启动模拟，显示执行过程
- `replay_recording` → 加载录制，显示回放控制器
- `inspect_state` → 高亮对应的 State 字段
- `analyze_performance` → 显示性能分析图表

### 2.5 Context Panel（项目上下文）

**功能清单**：
- 文件树（flows/、handlers/、prompts/）
- Flow 列表（显示节点数、校验状态）
- 最近操作历史
- 当前选择（选中的节点、文件）
- 项目配置

**为 Agent 提供的信息**：
- 项目结构（每次对话时注入）
- 当前 Flow 状态（节点数、连线数）
- 用户选择（焦点节点）
- 最近操作（供 Agent 理解上下文）

## 三、UI 布局设计

### 3.1 默认布局

```
┌────────────────────────────────────────────────────────────┐
│  Menu Bar                                                   │
├──────────────┬─────────────────────────────────────────────┤
│              │                                             │
│   Chat       │         Flow Canvas                         │
│   Panel      │         (React Flow)                        │
│              │                                             │
│   (对话界面)  │    [实时显示 Agent 创建的节点和连线]         │
│              │                                             │
│   - 消息列表  │                                             │
│   - 输入框    │                                             │
│   - 工具调用  │                                             │
│     可视化    │                                             │
│              │                                             │
├──────────────┼─────────────────────────────────────────────┤
│              │                                             │
│   Context    │         Code Editor / Debugger              │
│   Panel      │         (Monaco Editor / Debug View)        │
│              │                                             │
│   - 文件树    │    [显示 Agent 生成的代码或调试信息]         │
│   - Flow列表  │                                             │
│   - 状态检查  │                                             │
│              │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

### 3.2 面板系统

使用 `react-mosaic-component` 实现可拖拽调整的面板布局。

**特性**：
- 面板可拖拽调整大小
- 支持分屏（水平/垂直）
- 面板可最小化/最大化
- 布局状态持久化

## 四、Agent 设计

### 4.1 Agent 工作流程（参考 Claude Code 实现）

```
用户输入 ("帮我创建一个叙事生成的 Flow")
  ↓
Kal Agent 理解意图 (使用 @kal-ai/core Model)
  ↓
构建 API 请求
  ├── messages: 对话历史
  ├── tools: MCP 工具列表
  ├── system: 系统提示词
  ├── stream: true (启用流式响应)
  └── cache_control: ephemeral (启用 Prompt Caching)
  ↓
发送到 Claude API (流式请求)
  ↓
接收 SSE 流式响应
  ↓
解析流式事件
  ├── text_delta → 实时显示文本
  └── tool_use → 准备工具调用
  ↓
权限检查 (checkPermission)
  ├── auto: 自动批准
  ├── prompt: 询问用户
  ├── allowed-prompts: 检查允许列表
  └── custom: 自定义规则
  ↓
MCP Client 调用工具 (create_flow, add_node)
  ↓
MCP Server (Kal devkit) 执行操作
  ↓
FlowEditor 创建节点、连线
  ↓
MCP Server 返回结果 + 发射事件
  ├── tool_result → 返回给 Agent
  └── flow:node:added → 通知 UI
  ↓
Agent 接收结果，添加到对话历史
  ↓
继续对话 (发送新的 API 请求)
  ↓
Flow Canvas 实时显示新节点（高亮动画）
  ↓
Agent 返回响应 ("已创建 Flow，包含 1 个叙事节点")
  ↓
上下文管理
  ├── Token 计数 (input/output/cached)
  ├── 检查是否接近限制 (80% 阈值)
  └── 自动压缩 (如需要)
  ↓
用户确认/继续对话 ("再添加一个分支节点")
```

**关键点**（参考 Claude Code 最佳实践）：
- Agent 使用 `@kal-ai/core` 的 Model 进行对话（支持流式响应）
- Agent 使用 `@kal-ai/core` 的 Tools 注册 MCP 工具
- 所有 Flow 操作通过 MCP 协议调用 Kal devkit
- MCP Server 运行在独立进程，可以是本地或远程
- 实现完善的错误处理（try-catch、重试机制）
- 支持并行工具调用（Promise.all）
- 支持后台任务（run_in_background）

### 4.2 Agent 工具集

Agent 通过 MCP 协议调用 Kal devkit 提供的工具。

**MCP Server 架构**：
```
Kal devkit MCP Server
├── FlowEditor Service
│   ├── create_flow
│   ├── add_node
│   ├── connect_nodes
│   ├── update_node
│   ├── remove_node
│   ├── auto_layout
│   └── validate_flow
├── Simulator Service
│   ├── run_simulation
│   └── abort_simulation
├── Replayer Service
│   ├── replay_recording
│   ├── seek_to_frame
│   └── export_recording
├── Inspector Service
│   ├── inspect_state
│   ├── add_assertion
│   └── analyze_performance
└── Project Service
    ├── list_flows
    ├── search_nodes
    ├── get_node_types
    ├── read_file
    ├── write_file
    └── export_flow
```

#### Flow 编辑工具（MCP Tools）

| 工具名称 | 功能 | 关键参数 | MCP Server 实现 |
|---------|------|---------|----------------|
| `create_flow` | 创建新 Flow | name, description | FlowEditor.load() |
| `add_node` | 添加节点 | flowId, nodeType, name, config, position | FlowEditor.addNodeByType() |
| `connect_nodes` | 连接端口 | flowId, fromNode, fromPort, toNode, toPort | FlowEditor.connect() |
| `update_node` | 更新节点配置 | flowId, nodeId, config | FlowEditor.updateNode() |
| `remove_node` | 删除节点 | flowId, nodeId | FlowEditor.removeNode() |
| `auto_layout` | 自动排列节点 | flowId | FlowEditor.autoLayout() |
| `validate_flow` | 校验 Flow | flowId | FlowEditor.validate() |

#### 代码编辑工具（MCP Tools）

| 工具名称 | 功能 | 关键参数 | MCP Server 实现 |
|---------|------|---------|----------------|
| `create_handler` | 创建节点 handler | nodeId, handlerCode, description | 文件系统操作 + FlowEditor.updateNode() |
| `update_handler` | 修改 handler | nodeId, handlerCode | 文件系统操作 |
| `create_prompt_template` | 创建 prompt 模板 | name, template, variables | 文件系统操作 |
| `read_file` | 读取文件 | path | 文件系统操作 |
| `write_file` | 写入文件 | path, content | 文件系统操作 |

#### 调试与测试工具（MCP Tools）

| 工具名称 | 功能 | 关键参数 | MCP Server 实现 |
|---------|------|---------|----------------|
| `run_simulation` | 运行模拟测试 | flowId, maxRounds, playerStrategy, record | Simulator.run() |
| `replay_recording` | 回放录制 | recordingId, speed | Replayer.play() |
| `inspect_state` | 检查游戏状态 | path | StateManager.get() |
| `add_assertion` | 添加断言 | flowId, assertionType, config | Inspector.add() |
| `analyze_performance` | 性能分析 | flowId | UsageTracker.getSummary() |

#### 项目管理工具（MCP Tools）

| 工具名称 | 功能 | 关键参数 | MCP Server 实现 |
|---------|------|---------|----------------|
| `list_flows` | 列出所有 Flow | - | 文件系统扫描 |
| `search_nodes` | 搜索节点 | query, nodeType | FlowEditor.getState() + 过滤 |
| `get_node_types` | 获取节点类型列表 | category | NodeTypeRegistry.list() |
| `export_flow` | 导出 Flow JSON | flowId | FlowEditor.toJson() |

### 4.3 Agent 系统提示词（参考 Claude Code 提示词设计）

```
你是 KAL-AI IDE 的 AI 助手，专门帮助开发者创建和调试 AI 游戏的 Flow。

## 你的能力

1. **Flow 设计**：创建节点、连接端口、配置参数、自动布局
2. **代码编写**：生成 handler 函数、prompt 模板（TypeScript）
3. **调试测试**：运行模拟、回放录制、性能分析
4. **项目管理**：文件操作、Flow 管理、节点搜索

## 工作原则（参考 Claude Code 最佳实践）

1. **理解优先**：先理解用户需求，再规划操作
2. **渐进式**：一次做一个主要操作，避免过于复杂
3. **可视化**：操作会实时显示在 IDE 界面上
4. **并行执行**：独立操作使用并行工具调用（Promise.all）
5. **错误处理**：
   - 工具调用失败时，分析原因并调整策略
   - 不要重复相同的失败操作
   - 提供清晰的错误信息给用户
6. **最佳实践**：
   - Flow 设计避免环
   - 端口类型要匹配
   - 代码符合 TypeScript 规范
   - 合理使用 State 管理
7. **主动建议**：发现问题主动提出优化方案
8. **权限意识**：理解用户可能拒绝某些操作，尊重用户决定

## 工具使用规范（参考 Claude Code 工具系统）

### 文件操作
- 读取文件前使用 list_flows 或 search_nodes 确认文件存在
- 修改文件前先 read_file 查看内容
- 使用 write_file 时提供清晰的文件路径

### Flow 编辑
- 使用 validate_flow 检查 Flow 是否有效
- 使用 auto_layout 优化节点布局
- 连接节点前检查端口类型兼容性

### 调试测试
- 使用 run_simulation 前确认 Flow 已保存
- 使用 replay_recording 查看历史执行
- 使用 analyze_performance 识别性能瓶颈

### 并行操作
- 独立的读取操作可以并行执行
- 独立的工具调用可以并行执行
- 有依赖关系的操作必须顺序执行

## 典型场景

### 场景 1：创建新 Flow
用户："帮我创建一个 RPG 叙事生成的 Flow"
你的操作：
1. create_flow(name="RPG 叙事生成")
2. 并行添加节点：
   - add_node(nodeType="ai.narrative", name="生成场景描述")
   - add_node(nodeType="state.write", name="保存叙事")
3. connect_nodes(...)
4. auto_layout() 优化布局
5. 向用户解释 Flow 结构

### 场景 2：调试问题
用户："为什么我的 Flow 运行失败了？"
你的操作：
1. 并行检查：
   - validate_flow() 检查错误
   - read_file() 查看相关代码
2. 如果有环或端口不匹配，指出问题
3. run_simulation() 运行测试
4. inspect_state() 检查状态
5. 提供修复建议和具体步骤

### 场景 3：优化性能
用户："Token 用量太高了"
你的操作：
1. analyze_performance() 分析瓶颈
2. 并行检查：
   - 读取相关节点配置
   - 检查 prompt 模板
3. 识别问题：
   - Prompt 是否过长
   - 是否缺少缓存
   - 是否有重复调用
4. 提供优化建议：
   - 缩短 prompt
   - 启用缓存
   - 优化 Flow 结构
5. 修改节点配置并测试

## 上下文管理（参考 Claude Code）

- 保持对话简洁，避免冗长的解释
- 工具调用结果只保留关键信息
- 定期总结当前状态
- 接近 Token 限制时主动压缩上下文
```

### 4.4 上下文管理（参考 Claude Code 优化策略）

**上下文内容**：
- 当前项目（名称、Flow 列表、文件树）
- 当前 Flow（节点、连线、校验结果）
- 最近操作历史
- 用户选择（选中的节点/文件）
- 调试状态（是否运行中、当前回合、游戏状态）

**上下文注入策略**：
- **静态上下文**（System Prompt）：Agent 能力、工作原则、典型场景
- **动态上下文**（每次对话）：项目结构、Flow 状态、最近操作
- **按需上下文**（Agent 主动获取）：通过工具读取文件、检查状态
- **Prompt Caching**：标记可缓存内容（system prompt、项目上下文）

**上下文压缩**（参考 Claude Code 实现）：
```typescript
// Token 监控和自动压缩
function updateTokenCount(usage: Usage) {
  const {
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens
  } = usage

  // 计算总消耗
  const totalTokens = input_tokens + output_tokens

  // 计算缓存节省
  const cacheSavings = cache_read_input_tokens * 0.9

  // 更新统计
  updateUsageStats({ totalTokens, cacheSavings })

  // 检查是否接近限制（80% 阈值）
  const contextLimit = getModelContextLimit() // 如 200K
  if (totalTokens > contextLimit * 0.8) {
    compressContext()
  }
}

function compressContext() {
  // 1. 保留最近 10 轮对话
  const recentMessages = conversationHistory.slice(-10)

  // 2. 压缩旧消息
  const oldMessages = conversationHistory.slice(0, -10)
  const compressed = summarizeMessages(oldMessages)

  // 3. 重建对话历史
  conversationHistory = [
    { role: 'system', content: compressed },
    ...recentMessages
  ]
}
```

**Prompt Caching 策略**（参考 Claude Code）：
```typescript
// 标记可缓存内容
const request = {
  model: 'claude-sonnet-4-6',
  system: [
    {
      type: 'text',
      text: systemPrompt, // Agent 系统提示词
      cache_control: { type: 'ephemeral' } // 缓存 5 分钟
    },
    {
      type: 'text',
      text: projectContext, // 项目上下文
      cache_control: { type: 'ephemeral' }
    }
  ],
  messages: conversationHistory
}

// 缓存效果：
// - 首次请求：创建缓存（cache_creation_input_tokens）
// - 后续请求：读取缓存（cache_read_input_tokens，90% 折扣）
// - 有效期：5 分钟
```

**上下文优化建议**：
- 保留最近 10 轮对话
- 早期对话做摘要
- 工具调用结果只保留摘要
- 用户可手动清空上下文
- 使用 Prompt Caching 减少重复 Token 消耗

## 五、状态管理

使用 Zustand 管理全局状态。

### 5.1 状态结构（参考 Claude Code 状态管理）

```typescript
interface IDEStore {
  // Agent 状态（参考 Claude Code Agent 系统）
  agent: {
    conversationHistory: Message[]
    isProcessing: boolean
    currentToolCall: ToolCall | null
    mcpConnected: boolean  // MCP Server 连接状态
    streamingState: {
      isStreaming: boolean
      currentBlock: ContentBlock | null
      accumulatedText: string
    }
    usage: {
      inputTokens: number
      outputTokens: number
      cacheCreationTokens: number
      cacheReadTokens: number
      totalCost: number
    }
    permissionMode: 'auto' | 'prompt' | 'allowed-prompts' | 'custom'
  }

  // 项目状态
  project: {
    current: Project | null
    flows: Flow[]
    fileTree: FileNode[]
    recentOperations: Operation[] // 最近操作历史
  }

  // 编辑器状态（从 MCP Server 同步）
  editor: {
    currentFlow: Flow | null
    selectedNodes: string[]
    selectedEdges: string[]
    validation: ValidationResult
    isDirty: boolean // 是否有未保存的更改
  }

  // 调试状态（从 MCP Server 同步）
  debug: {
    isRunning: boolean
    recording: Recording | null
    currentFrame: RecordingFrame | null
    breakpoints: Breakpoint[]
    performance: PerformanceStats | null
  }

  // UI 状态
  ui: {
    activeView: ViewId
    panelVisibility: Record<PanelId, boolean>
    theme: 'light' | 'dark'
    layout: MosaicNode<PanelId> // react-mosaic 布局
  }
}
```

### 5.2 关键操作（参考 Claude Code 实现）

**Agent 操作**：
- `sendMessage(message: string)` - 发送消息给 Kal Agent
  - 构建 API 请求（messages + tools + system）
  - 启用流式响应
  - 处理 SSE 事件流
- `connectMCP(serverUrl: string)` - 连接 MCP Server
  - 支持 stdio 和 SSE 传输
  - 自动重连机制
  - 连接状态监控
- `disconnectMCP()` - 断开 MCP Server
- `interruptExecution()` - 中断当前执行
- `retryLastMessage()` - 重试最后一条消息

**MCP 工具调用**（参考 Claude Code 工具系统）：
```typescript
// 工具调用流程
async function callMCPTool(toolName: string, args: any) {
  // 1. 权限检查
  const permitted = await checkPermission(toolName, args)
  if (!permitted) {
    throw new PermissionDeniedError()
  }

  // 2. 调用 MCP 工具
  try {
    const result = await mcpClient.callTool(toolName, args)

    // 3. 触发 UI 更新事件
    eventBus.emit(`tool:${toolName}:success`, result)

    return result
  } catch (error) {
    // 4. 错误处理
    eventBus.emit(`tool:${toolName}:error`, error)
    throw error
  }
}

// 并行工具调用
async function callMCPToolsParallel(calls: ToolCall[]) {
  return await Promise.all(
    calls.map(call => callMCPTool(call.name, call.args))
  )
}
```

**权限检查**（参考 Claude Code 权限系统）：
```typescript
async function checkPermission(toolName: string, args: any): Promise<boolean> {
  const mode = store.agent.permissionMode

  switch (mode) {
    case 'auto':
      // 自动批准所有工具
      return true

    case 'prompt':
      // 每次询问用户
      return await askUserForPermission(toolName, args)

    case 'allowed-prompts':
      // 检查是否在允许列表中（基于语义匹配）
      return isAllowedPrompt(toolName, args)

    case 'custom':
      // 自定义规则
      return evaluateCustomRules(toolName, args)

    default:
      return false
  }
}
```

**UI 操作**：
- `loadFlow(flowId: string)` - 加载 Flow（触发 MCP 工具）
- `updateNode(nodeId, patch)` - 更新节点（触发 MCP 工具）
- `startDebug()` - 开始调试（触发 MCP 工具）
- `togglePanel(panelId)` - 切换面板可见性
- `saveLayout()` - 保存布局配置

### 5.3 状态同步（参考 Claude Code 事件系统）

**MCP Server → IDE**（通过 MCP notifications）：
```typescript
// MCP Server 发送事件
mcpServer.sendNotification({
  method: 'notifications/event',
  params: {
    type: 'flow:node:added',
    data: {
      flowId: 'flow-123',
      nodeId: 'node-456',
      nodeType: 'ai.narrative',
      position: { x: 100, y: 200 }
    }
  }
})

// IDE 接收事件
mcpClient.onNotification('notifications/event', (params) => {
  const { type, data } = params

  // 分发到 Event Bus
  eventBus.emit(type, data)
})

// UI 组件订阅事件
eventBus.on('flow:node:added', (data) => {
  // 更新 Flow Canvas
  addNodeWithAnimation(data.nodeId, data.position)

  // 更新状态
  store.editor.currentFlow.nodes.push(data)
})
```

**IDE → MCP Server**（用户手动操作）：
```typescript
// 用户在 Canvas 上拖拽节点
function onNodeDragEnd(nodeId: string, position: Position) {
  // 调用 MCP 工具同步到 Server
  await callMCPTool('update_node', {
    flowId: currentFlowId,
    nodeId,
    position
  })

  // Server 返回确认后，更新本地状态
  store.editor.currentFlow.nodes.find(n => n.id === nodeId).position = position
}
```

**事件类型**（参考 Claude Code 事件系统）：
- `flow:created` - Flow 已创建
- `flow:node:added` - 节点已添加
- `flow:node:updated` - 节点已更新
- `flow:node:removed` - 节点已删除
- `flow:edge:added` - 连线已添加
- `flow:edge:removed` - 连线已删除
- `simulation:started` - 模拟已开始
- `simulation:round` - 模拟回合更新
- `simulation:completed` - 模拟已完成
- `tool:success` - 工具调用成功
- `tool:error` - 工具调用失败

## 六、目录结构

```
packages/ide/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── layout/
│   │   ├── WorkspaceLayout.tsx
│   │   ├── MenuBar.tsx
│   │   └── StatusBar.tsx
│   ├── chat/
│   │   ├── ChatInterface.tsx
│   │   ├── MessageList.tsx
│   │   ├── InputBox.tsx
│   │   └── ToolCallCard.tsx
│   ├── flow-canvas/
│   │   ├── FlowCanvas.tsx
│   │   ├── CustomNode.tsx
│   │   └── CustomEdge.tsx
│   ├── code-editor/
│   │   ├── CodeEditor.tsx
│   │   └── FileTab.tsx
│   ├── debugger/
│   │   ├── Debugger.tsx
│   │   ├── DebugToolbar.tsx
│   │   ├── StateInspector.tsx
│   │   └── NodeOutputs.tsx
│   ├── context-panel/
│   │   ├── ContextPanel.tsx
│   │   ├── FileTree.tsx
│   │   └── FlowList.tsx
│   ├── agent/
│   │   ├── KalAgent.ts          # 基于 @kal-ai/core 实现
│   │   ├── MCPClient.ts         # MCP 客户端封装
│   │   ├── ContextManager.ts    # 上下文管理
│   │   └── EventBus.ts          # Agent → UI 事件总线
│   ├── store/
│   │   ├── useIDEStore.ts
│   │   └── types.ts
│   ├── hooks/
│   │   ├── useKalAgent.ts       # Kal Agent Hook
│   │   ├── useMCPTools.ts       # MCP 工具调用 Hook
│   │   └── useProject.ts
│   └── utils/
│       ├── shortcuts.ts
│       └── animations.ts
└── public/
    └── templates/

packages/devkit-mcp-server/  # Kal devkit MCP Server
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP Server 入口
│   ├── server.ts             # MCP Server 实现
│   ├── services/
│   │   ├── flow-editor.ts    # FlowEditor Service
│   │   ├── simulator.ts      # Simulator Service
│   │   ├── replayer.ts       # Replayer Service
│   │   ├── inspector.ts      # Inspector Service
│   │   └── project.ts        # Project Service
│   └── tools/
│       ├── flow-tools.ts     # Flow 编辑工具定义
│       ├── debug-tools.ts    # 调试工具定义
│       └── project-tools.ts  # 项目管理工具定义
└── __tests__/
```

**关键说明**：

1. **IDE 项目**（`packages/ide/`）：
   - 前端 Web 应用
   - Agent 基于 `@kal-ai/core` 实现
   - 通过 MCP Client 连接 devkit MCP Server

2. **MCP Server 项目**（`packages/devkit-mcp-server/`）：
   - 独立的 MCP Server 进程
   - 封装 `@kal-ai/devkit` 的所有能力
   - 通过 MCP 协议暴露工具

## 七、开发计划

### Phase 1：基础框架（3 天）
- Vite + React 项目初始化
- 基础布局（Mosaic）
- 状态管理（Zustand）
- 路由和导航

### Phase 2：MCP Server 开发（7 天）

**参考 Claude Code MCP 实现**：
- Claude Code 支持 33+ MCP 服务器
- 使用 stdio 和 SSE 两种传输方式
- 完善的工具注册和事件通知机制
- 支持批量操作和性能优化

- **MCP Server 基础**（2 天）
  - MCP 协议实现（参考 @modelcontextprotocol/sdk）
  - Server 启动和连接管理（stdio/SSE 传输）
  - 工具注册机制（类似 Claude Code 15+ 工具）
  - 事件通知系统（参考 Claude Code 8,884 个监听器）
  - 错误处理（参考 Claude Code 2,512 个 try-catch）

- **FlowEditor Service**（2 天）
  - 封装 @kal-ai/devkit FlowEditor
  - 实现 Flow 编辑工具（create_flow、add_node 等）
  - 状态管理和缓存（参考 Claude Code 缓存策略）
  - 批量操作支持（add_nodes_batch）
  - 事件发射（flow:node:added 等）

- **Simulator/Replayer Service**（2 天）
  - 封装 Simulator 和 Replayer
  - 实现调试工具（run_simulation、replay_recording 等）
  - 录制管理和回放控制
  - 性能监控（参考 Claude Code 性能追踪）

- **Project Service**（1 天）
  - 文件系统操作（read_file、write_file）
  - 项目管理工具（list_flows、search_nodes）
  - 文件树生成和缓存

### Phase 3：Agent 核心（5 天）

**参考 Claude Code Agent 架构**：
- 1,428 个 async 函数，4,888 次 await
- 完善的流式处理（SSE + ReadableStream）
- 多级权限管理（auto/prompt/allowed-prompts/custom）
- 上下文管理和 Prompt Caching

- **Kal Agent 实现**（3 天）
  - 基于 @kal-ai/core 创建 Agent
  - Model 配置（Claude API + 流式响应）
  - 对话历史管理（参考 Claude Code 对话管理）
  - 流式响应处理（SSE 事件循环）
    - message_start/stop
    - content_block_delta
    - tool_use 事件
  - 权限系统实现（参考 Claude Code 权限管理）
    - auto 模式（自动批准）
    - prompt 模式（每次询问）
    - allowed-prompts 模式（语义匹配）
    - custom 模式（自定义规则）
  - 上下文管理（参考 Claude Code 优化策略）
    - Token 计数和监控
    - 自动压缩（80% 阈值）
    - Prompt Caching 支持

- **MCP Client 集成**（2 天）
  - MCP Client 封装（@modelcontextprotocol/sdk）
  - 工具注册和调用（参考 Claude Code 工具系统）
  - 事件订阅和处理（参考 Claude Code 事件系统）
  - 连接管理和自动重连
  - 错误处理和重试机制（参考 Claude Code 错误处理）
  - 并行工具调用支持（Promise.all）

### Phase 4：可视化面板（7 天）

**参考 Claude Code UI 设计**：
- 丰富的终端 UI（Spinner、进度条、ANSI 颜色）
- 实时流式显示（SSE 流式响应）
- 工具调用可视化
- 完善的错误提示

- **Flow Canvas**（3 天）
  - React Flow 集成
  - 自定义节点组件（参考 Claude Code 节点类型）
  - 实时更新和动画（参考 Claude Code 实时反馈）
    - 节点出现动画
    - 连线动画
    - 高亮效果
  - 事件订阅（flow:node:added 等）
  - 手动编辑支持（拖拽、连线）
  - 自动布局算法

- **Code Editor**（2 天）
  - Monaco Editor 集成
  - TypeScript 支持（语法高亮、类型检查）
  - Diff 显示（参考 Claude Code diff 功能）
  - 多文件 Tab 切换
  - 智能补全（基于 @kal-ai 类型定义）
  - 格式化（Prettier）

- **Debugger**（2 天）
  - 调试控制器（运行、暂停、停止、单步）
  - 状态检查器（实时查看 State）
  - 节点输出查看
  - Token 用量统计（参考 Claude Code Token 计数）
  - 回放控制（时间轴、速度控制）
  - 性能分析（参考 Claude Code 性能监控）

### Phase 5：UI 集成与联动（5 天）

**参考 Claude Code UI 集成**：
- 事件驱动架构（8,884 个事件监听器）
- 实时 UI 更新
- 流式响应显示
- 完善的用户交互

- **Chat Interface**（2 天）
  - 对话界面布局
  - 流式响应显示（参考 Claude Code SSE 处理）
    - 实时文本增量显示
    - 打字机效果
    - 中断执行支持
  - 工具调用可视化（参考 Claude Code 工具卡片）
    - 工具名称和参数显示
    - 执行状态指示
    - 结果展示
  - 多行输入和快捷键
  - Token 用量显示（input/output/cached）
  - 上下文提示（当前 Flow、选中节点）

- **面板联动**（2 天）
  - MCP 事件 → UI 更新（参考 Claude Code 事件系统）
    - flow:node:added → Canvas 显示新节点
    - tool:create_handler → Editor 打开文件
    - simulation:started → Debugger 显示执行
  - 动画效果（参考 Claude Code 实时反馈）
    - 节点出现动画
    - 连线绘制动画
    - 高亮闪烁效果
  - 状态同步（参考 Claude Code 状态管理）
    - Agent 状态 → UI 状态
    - MCP Server 状态 → Editor 状态
    - 双向同步（用户操作 → MCP Server）

- **Context Panel**（1 天）
  - 文件树（File System Access API）
  - Flow 列表（显示节点数、校验状态）
  - 最近操作历史
  - 上下文显示（为 Agent 提供信息）
  - 项目配置

### Phase 6：优化与测试（3 天）

**参考 Claude Code 优化策略**：
- Prompt Caching（90% 成本节省）
- 并行执行（Promise.all）
- 错误处理（2,512 个 try-catch）
- 性能监控

- **性能优化**（1 天）
  - 上下文管理优化（参考 Claude Code）
    - Token 计数和监控
    - 自动压缩（80% 阈值）
    - Prompt Caching 实现
  - MCP 调用优化
    - 批量操作（add_nodes_batch）
    - 并行执行（Promise.all）
    - 连接池管理
  - UI 渲染优化
    - 虚拟滚动（长列表）
    - 防抖和节流
    - React.memo 优化

- **错误处理和重试**（1 天）
  - 完善的错误处理（参考 Claude Code 2,512 个 try-catch）
    - API 错误（RateLimitError、AuthenticationError）
    - 网络错误（TimeoutError、NetworkError）
    - MCP 错误（ToolExecutionError、ConnectionError）
  - 重试机制
    - 指数退避
    - 最大重试次数
    - 用户确认重试
  - 错误提示
    - 清晰的错误信息
    - 修复建议
    - 错误日志

- **MCP 连接稳定性**（0.5 天）
  - 自动重连（参考 Claude Code 连接管理）
  - 连接状态监控
  - 心跳检测
  - 断线恢复

- **测试**（0.5 天）
  - 单元测试（核心功能）
  - 集成测试（MCP 通信）
  - E2E 测试（用户流程）
  - 性能测试（Token 用量、响应时间）

**总计：30 天**

**并行开发建议**（参考 Claude Code 开发模式）：
- Phase 2（MCP Server）和 Phase 3（Agent）可以部分并行
- Phase 4（可视化面板）可以在 Phase 3 完成后立即开始
- 建议 2-3 人团队：
  - 1 人负责 MCP Server（参考 Claude Code 工具系统）
  - 1 人负责 Agent（参考 Claude Code Agent 架构）
  - 1 人负责 UI（参考 Claude Code UI 设计）

## 八、技术选型（参考 Claude Code 技术栈）

| 功能 | 技术方案 | 理由 | Claude Code 参考 |
|------|---------|------|-----------------|
| UI 框架 | React 18 | 生态成熟、组件丰富 | Claude Code 使用 React |
| 状态管理 | Zustand | 轻量、简单、TypeScript 友好 | 类似 Claude Code 的状态管理 |
| 构建工具 | Vite | 快速、现代、开箱即用 | Claude Code 使用现代构建工具 |
| Flow 渲染 | React Flow | 专业的流程图库、可定制性强 | - |
| 代码编辑器 | Monaco Editor | VS Code 同款、功能完整 | Claude Code 集成代码编辑 |
| 布局系统 | react-mosaic-component | 可拖拽面板、灵活布局 | - |
| 文件系统 | File System Access API | 浏览器原生、无需后端 | Claude Code 使用 fs 模块 |
| Git | isomorphic-git | 纯 JS 实现、浏览器可用 | Claude Code 深度集成 Git |
| 样式 | Tailwind CSS | 快速开发、一致性好 | - |
| 组件库 | shadcn/ui | 现代、可定制、TypeScript | - |
| **Agent 实现** | **@kal-ai/core** | **Kal 框架，Model + Tools 能力** | **Claude Code Agent 架构** |
| **流式处理** | **SSE (Server-Sent Events)** | **实时响应、降低 TTFB** | **Claude Code 核心技术** |
| **能力提供** | **MCP Server** | **标准协议，解耦 IDE 和 Kal** | **Claude Code MCP 集成** |
| **MCP 协议** | **@modelcontextprotocol/sdk** | **官方 SDK，稳定可靠** | **Claude Code 使用** |
| **异步处理** | **async/await + Promise.all** | **现代 JS 异步模式** | **Claude Code 大量使用** |
| **错误处理** | **try-catch + 重试机制** | **完善的错误恢复** | **Claude Code 2500+ try-catch** |
| **事件系统** | **EventEmitter** | **松耦合、可扩展** | **Claude Code 8800+ 监听器** |

### 8.1 为什么使用 MCP（参考 Claude Code MCP 集成）

**优势**（参考 Claude Code 设计理念）：
1. **解耦**：IDE 和 Kal devkit 独立开发、独立部署
   - Claude Code 通过 MCP 集成外部工具（filesystem、github、postgres 等）
   - 工具更新不影响主程序
2. **标准化**：MCP 是标准协议，未来可以接入其他工具
   - Claude Code 支持 33+ MCP 服务器引用
   - 社区可以贡献新的 MCP 服务器
3. **灵活性**：MCP Server 可以本地运行或远程部署
   - stdio 传输：本地进程通信（Claude Code 主要方式）
   - SSE 传输：远程 HTTP 通信（Claude Code 支持）
4. **可扩展**：容易添加新工具，不需要修改 IDE 代码
   - Claude Code 通过配置文件添加 MCP 服务器
   - 无需重新编译或部署
5. **安全性**：MCP Server 可以做权限控制和沙箱隔离
   - Claude Code 实现多级权限管理
   - 用户可以控制工具访问范围

**架构对比**：

```
传统方式（直接调用）：
IDE → @kal-ai/devkit (直接 import)
- 紧耦合
- 难以独立部署
- 版本升级困难
- 浏览器环境限制

MCP 方式（协议调用 - Claude Code 方式）：
IDE → MCP Client → MCP Server → @kal-ai/devkit
- 松耦合
- 独立部署
- 版本独立升级
- 支持远程调用
- 跨平台兼容
```

**Claude Code MCP 实现参考**：
```typescript
// MCP 服务器配置（参考 Claude Code settings.json）
{
  "mcpServers": {
    "kal-devkit": {
      "command": "node",
      "args": ["./devkit-mcp-server/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}

// MCP Client 连接（参考 Claude Code 实现）
const mcpClient = createMcpClient({
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['./devkit-mcp-server/dist/index.js']
  }
})

await mcpClient.connect()

// 列出可用工具
const tools = await mcpClient.listTools()
// [
//   { name: 'create_flow', description: '...' },
//   { name: 'add_node', description: '...' },
//   ...
// ]

// 调用工具
const result = await mcpClient.callTool('add_node', {
  flowId: 'flow-123',
  nodeType: 'ai.narrative',
  name: '生成场景'
})
```

## 九、部署方案

### 9.1 静态部署（推荐）

直接部署到 Vercel/Netlify/GitHub Pages：

```bash
# 构建
bun run build

# 部署到 Vercel
vercel deploy
```

### 9.2 本地运行

```bash
# 开发模式
bun run dev

# 生产构建
bun run build
bun run preview
```

### 9.3 Electron 打包（可选）

如需桌面应用，可用 Electron 打包。

## 十、与 Agent 的集成

### 10.1 核心理念

**Agent First, Visual Second**：
- IDE 的主要交互方式是与 AI Agent 对话
- 可视化界面用于展示 Agent 的工作成果
- 用户可以手动操作，但 Agent 是推荐方式

### 10.2 Agent 基于 Kal 实现（参考 Claude Code Agent 架构）

**Kal Agent 架构**：
```typescript
// 使用 @kal-ai/core 创建 Agent（参考 Claude Code 实现）
import { createKalCore } from '@kal-ai/core'
import { createMcpClient } from '@modelcontextprotocol/sdk'

const core = createKalCore({
  models: {
    default: {
      modelId: 'claude-sonnet-4-6', // 参考 Claude Code 默认模型
      apiKey: process.env.CLAUDE_API_KEY,
      maxTokens: 32000, // 参考 Claude Code 配置
      stream: true, // 启用流式响应
    }
  }
})

// 连接 MCP Server（参考 Claude Code MCP 集成）
const mcpClient = createMcpClient({
  transport: {
    type: 'stdio',
    command: 'kal-devkit-mcp-server',
  }
})

await mcpClient.connect()

// 注册 MCP 工具到 Kal（参考 Claude Code 工具注册）
const mcpTools = await mcpClient.listTools()
mcpTools.forEach(tool => {
  core.tools.register(tool, async (args) => {
    // 权限检查（参考 Claude Code 权限系统）
    const permitted = await checkPermission(tool.name, args)
    if (!permitted) {
      throw new PermissionDeniedError()
    }

    // 调用 MCP 工具
    return await mcpClient.callTool(tool.name, args)
  })
})

// Agent 对话（参考 Claude Code 流式处理）
const stream = await core.runWithTools({
  messages: [{ role: 'user', content: '创建一个叙事 Flow' }],
  maxRounds: 10,
  stream: true, // 启用流式响应
  // Prompt Caching（参考 Claude Code 优化）
  system: [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' }
    }
  ]
})

// 处理流式响应（参考 Claude Code SSE 处理）
for await (const event of stream) {
  switch (event.type) {
    case 'message_start':
      console.log('Message started')
      break
    case 'content_block_delta':
      if (event.delta.type === 'text_delta') {
        // 实时显示文本
        displayText(event.delta.text)
      }
      break
    case 'tool_use':
      // 工具调用
      console.log('Tool call:', event.name, event.input)
      break
    case 'message_stop':
      console.log('Message completed')
      break
  }
}
```

**关键点**（参考 Claude Code 最佳实践）：
- Agent 使用 `@kal-ai/core` 的 Model 能力（支持流式响应）
- Agent 使用 `@kal-ai/core` 的 Tools 能力（MCP 工具注册）
- MCP 工具通过 `core.tools.register()` 注册
- Agent 自动调用 MCP 工具完成任务
- 实现完善的错误处理（try-catch、重试）
- 支持并行工具调用（Promise.all）
- 支持 Prompt Caching（节省成本）
- 实现权限检查（多级权限模式）

### 10.3 实时同步机制（参考 Claude Code 事件系统）

**MCP Server → IDE 事件流**：
```
MCP Server 执行操作
  ↓
触发事件（通过 MCP notifications）
  ↓
MCP Client 接收事件
  ↓
Event Bus 分发事件
  ↓
UI 组件订阅事件并更新
```

**事件类型**（参考 Claude Code 事件系统）：
- `flow:node:added` - 节点已添加
- `flow:node:updated` - 节点已更新
- `flow:edge:added` - 连线已添加
- `simulation:started` - 模拟已开始
- `simulation:round` - 模拟回合更新
- `simulation:completed` - 模拟已完成
- `tool:success` - 工具调用成功
- `tool:error` - 工具调用失败

**实现示例**（参考 Claude Code 实现）：
```typescript
// MCP Server 端（发送事件）
class FlowEditorService {
  private eventEmitter: EventEmitter

  async addNode(args: AddNodeArgs) {
    const nodeId = this.editor.addNodeByType(args.nodeType, args.position)

    // 发射事件（参考 Claude Code 事件发射）
    this.eventEmitter.emit('flow:node:added', {
      flowId: args.flowId,
      nodeId,
      nodeType: args.nodeType,
      position: args.position
    })

    return { success: true, nodeId }
  }
}

// MCP Server 通过 notifications 发送事件
mcpServer.sendNotification({
  method: 'notifications/event',
  params: {
    type: 'flow:node:added',
    data: { flowId, nodeId, nodeType, position }
  }
})

// IDE 端（接收事件）
mcpClient.onNotification('notifications/event', (params) => {
  const { type, data } = params

  // 分发到 Event Bus（参考 Claude Code 事件分发）
  eventBus.emit(type, data)
})

// UI 组件订阅事件（参考 Claude Code UI 更新）
useEffect(() => {
  const handler = (data: NodeAddedEvent) => {
    // 添加节点到 Canvas（带动画）
    addNodeWithAnimation(data.nodeId, data.position)

    // 更新状态
    setNodes(prev => [...prev, {
      id: data.nodeId,
      type: data.nodeType,
      position: data.position
    }])
  }

  eventBus.on('flow:node:added', handler)

  return () => {
    eventBus.off('flow:node:added', handler)
  }
}, [])
```

### 10.4 双向操作支持

**Agent 操作（通过 MCP）**：
- Agent 调用 MCP 工具
- MCP Server 执行操作
- 触发事件通知 UI
- UI 实时更新

**用户手动操作**：
- 用户在 Canvas 上拖拽节点
- UI 调用 MCP 工具同步
- MCP Server 更新状态
- 下次 Agent 对话时获取最新状态

### 10.5 上下文同步

**每次对话前注入上下文**：
- 当前项目信息（名称、Flow 列表）
- 当前 Flow 状态（节点数、连线数、校验结果）
- 用户选择（选中的节点）
- 最近操作历史

**上下文来源**：
- 通过 MCP 工具查询（`list_flows`、`validate_flow`）
- 从本地状态读取（用户选择、UI 状态）
- 注入到 Agent 的 System Prompt

### 10.6 错误处理（参考 Claude Code 错误处理机制）

**MCP 工具调用失败**（参考 Claude Code 2500+ try-catch 块）：
```typescript
// 完善的错误处理
async function executeMCPTool(toolName: string, args: any) {
  try {
    // 调用 MCP 工具
    const result = await mcpClient.callTool(toolName, args)

    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: result
    }
  } catch (error) {
    // 错误分类处理（参考 Claude Code 错误类型）
    if (error instanceof RateLimitError) {
      // 速率限制 - 等待重试
      await sleep(error.retryAfter)
      return executeMCPTool(toolName, args) // 重试
    }

    if (error instanceof TimeoutError) {
      // 超时 - 询问用户是否重试
      const shouldRetry = await askUserToRetry()
      if (shouldRetry) {
        return executeMCPTool(toolName, args)
      }
    }

    if (error instanceof PermissionDeniedError) {
      // 权限拒绝 - 返回错误信息
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        is_error: true,
        content: 'Permission denied by user'
      }
    }

    // 其他错误 - 返回详细错误信息
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      is_error: true,
      content: formatError(error)
    }
  }
}

// 错误信息格式化（参考 Claude Code）
function formatError(error: Error): string {
  return JSON.stringify({
    code: error.name,
    message: error.message,
    details: error.stack?.split('\n').slice(0, 3) // 前3行堆栈
  }, null, 2)
}
```

**MCP Server 断线**（参考 Claude Code 连接管理）：
```typescript
// 自动重连机制
class MCPConnectionManager {
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  async connect() {
    try {
      await this.mcpClient.connect()
      this.reconnectAttempts = 0
      this.updateConnectionStatus('connected')
    } catch (error) {
      await this.handleConnectionError(error)
    }
  }

  private async handleConnectionError(error: Error) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      this.updateConnectionStatus('reconnecting')

      // 指数退避
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      await sleep(delay)

      await this.connect()
    } else {
      this.updateConnectionStatus('disconnected')
      this.showConnectionError(error)
    }
  }

  private updateConnectionStatus(status: ConnectionStatus) {
    store.agent.mcpConnected = (status === 'connected')
    eventBus.emit('mcp:connection:status', status)
  }
}
```

**Agent 响应错误**（参考 Claude Code Agent 错误处理）：
```typescript
// Agent 对话错误处理
async function sendMessageToAgent(message: string) {
  try {
    const stream = await agent.sendMessage(message)

    for await (const event of stream) {
      await handleStreamEvent(event)
    }
  } catch (error) {
    if (error instanceof APIError) {
      // API 错误 - 显示给用户
      showError('API Error', error.message)
    } else if (error instanceof NetworkError) {
      // 网络错误 - 检查连接
      showError('Network Error', 'Please check your internet connection')
    } else {
      // 未知错误 - 记录日志
      console.error('Unexpected error:', error)
      showError('Unexpected Error', 'Something went wrong. Please try again.')
    }
  }
}
```

**用户撤销操作**（参考 Claude Code undo/redo）：
```typescript
// 基于 FlowEditor 的 undo/redo
async function undoLastAction() {
  try {
    // 调用 MCP 工具
    await mcpClient.callTool('undo_last_action', {
      flowId: currentFlowId
    })

    // UI 同步更新
    eventBus.emit('flow:undo', { flowId: currentFlowId })
  } catch (error) {
    showError('Undo Failed', error.message)
  }
}
```

## 十一、用户体验设计

### 11.1 典型工作流

**新手用户**：
1. 打开 IDE，看到欢迎界面
2. 在 Chat 中输入："我想做一个文字冒险游戏"
3. Agent 询问细节（主题、玩法）
4. Agent 创建项目结构和初始 Flow
5. 用户在 Canvas 上看到 Flow 结构
6. 用户继续对话："添加战斗系统"
7. Agent 扩展 Flow，添加战斗节点
8. 用户点击"运行测试"
9. Debugger 显示执行过程

**进阶用户**：
1. 打开现有项目
2. 在 Chat 中："优化叙事节点的 prompt"
3. Agent 分析当前 prompt，提出建议
4. 用户确认，Agent 修改代码
5. 用户："运行 A/B 测试对比效果"
6. Agent 配置测试，显示结果对比

### 11.2 快捷操作

- `@flow` 提及特定 Flow
- `@node` 提及特定节点
- `/test` 快速运行测试
- `/debug` 进入调试模式
- `/optimize` 性能优化建议

### 11.3 错误提示

- Agent 操作失败时，清晰说明原因
- 提供修复建议或替代方案
- 用户可以撤销或重试

## 十二、与 Cursor/Claude Code 的对比

| 特性 | Cursor/Claude Code | KAL-AI IDE |
|------|-------------------|-----------|
| 主要用途 | 通用代码编辑 | AI 游戏 Flow 开发 |
| 核心交互 | 对话 + 代码编辑 | 对话 + 可视化 Flow |
| 工具集 | 文件操作、终端、搜索 | Flow 编辑、模拟测试、调试 |
| 可视化 | 代码 diff | Flow 图、状态检查器、回放器 |
| 领域知识 | 通用编程 | AI 游戏开发（prompt、状态管理、Flow 设计）|
| 独特能力 | - | 模拟测试、录制回放、性能分析 |

## 十三、未来扩展（参考 Claude Code 特殊功能）

### 13.1 协作功能（参考 Claude Code Remote Mode）

**Claude Code Remote Mode 参考**：
- 远程协作支持
- WebSocket 连接（155 次引用）
- 实时状态同步

**KAL-AI IDE 协作功能**：
- 多人同时编辑 Flow
  - 实时同步节点和连线
  - 冲突检测和解决
  - 用户光标显示
- Agent 作为团队助手
  - 共享对话历史
  - 协作式问题解决
  - 团队知识库
- 操作历史和版本控制
  - Git 集成（参考 Claude Code Git 深度集成）
  - 变更追踪
  - 回滚支持

### 13.2 学习能力（参考 Claude Code Auto Memory）

**Claude Code Auto Memory 参考**：
- 跨会话记忆系统
- MEMORY.md 自动加载（前 200 行）
- 语义化组织（architecture.md、debugging.md、patterns.md）
- 用户偏好记录

**KAL-AI IDE 学习能力**：
- Agent 学习用户习惯
  - 记住常用节点类型
  - 记住代码风格偏好
  - 记住调试策略
- 记住项目特定的约定
  - 命名规范
  - 架构模式
  - 最佳实践
- 提供个性化建议
  - 基于历史操作
  - 基于项目上下文
  - 基于用户反馈

**实现方式**（参考 Claude Code）：
```typescript
// 记忆目录结构
~/.kal-ai/projects/<project-hash>/memory/
├── MEMORY.md              // 主记忆文件（自动加载）
├── flow-patterns.md       // Flow 设计模式
├── debugging-tips.md      // 调试经验
├── user-preferences.md    // 用户偏好
└── project-conventions.md // 项目约定

// 记忆管理
class MemoryManager {
  async saveMemory(category: string, content: string) {
    // 保存到对应的记忆文件
    await writeFile(`memory/${category}.md`, content)
  }

  async loadMemory(): Promise<string> {
    // 加载 MEMORY.md（前 200 行）
    const memory = await readFile('memory/MEMORY.md')
    return memory.split('\n').slice(0, 200).join('\n')
  }

  async updateMemory(key: string, value: string) {
    // 更新记忆条目
    const memory = await this.loadMemory()
    const updated = updateMemoryEntry(memory, key, value)
    await writeFile('memory/MEMORY.md', updated)
  }
}
```

### 13.3 插件系统（参考 Claude Code Skills 和 MCP）

**Claude Code 扩展机制参考**：
- Skills 系统（7 个内置技能）
  - keybindings-help
  - claude-developer-platform
  - frontend-design
  - skill-creator
  - theme-factory
  - webapp-testing
- MCP Servers（33+ 服务器引用）
  - filesystem、github、postgres
  - puppeteer、brave-search
  - 社区贡献的服务器

**KAL-AI IDE 插件系统**：
- 自定义 Agent 工具
  - 扩展 MCP 工具集
  - 自定义工具定义
  - 工具权限配置
- 扩展节点类型
  - 自定义节点类型
  - 自定义端口类型
  - 自定义节点渲染
- 集成第三方服务
  - 通过 MCP 协议
  - 支持 stdio 和 SSE 传输
  - 社区插件市场

**插件配置**（参考 Claude Code settings.json）：
```json
{
  "plugins": {
    "custom-nodes": {
      "enabled": true,
      "path": "~/.kal-ai/plugins/custom-nodes"
    }
  },
  "mcpServers": {
    "custom-service": {
      "command": "node",
      "args": ["./custom-mcp-server.js"],
      "env": {
        "API_KEY": "${env:CUSTOM_API_KEY}"
      }
    }
  }
}
```

### 13.4 移动端（参考 Claude Code 跨平台支持）

**Claude Code 跨平台参考**：
- 支持多平台（darwin、linux、win32）
- 单文件部署（11.27 MB）
- 终端 UI 适配

**KAL-AI IDE 移动端**：
- 移动浏览器访问
  - 响应式布局
  - 触摸手势支持
  - 移动端优化
- 简化的 Chat 界面
  - 专注对话交互
  - 简化的工具调用显示
  - 语音输入支持
- 查看和审批 Agent 操作
  - 实时通知
  - 快速审批
  - 远程监控

### 13.5 多模态输入（参考 Claude Code 多模态支持）

**Claude Code 多模态参考**：
- 图像文件支持（PNG、JPG）
- PDF 文件支持（最多 20 页）
- Sharp 图像处理（2.48 MB WASM）

**KAL-AI IDE 多模态输入**：
- 用户上传截图 → Agent 理解 UI 设计
  - 图像识别
  - UI 元素提取
  - 自动生成 Flow
- 用户上传文档 → Agent 提取游戏规则
  - PDF 解析
  - 文本提取
  - 规则转换为 Flow
- 语音输入 → 语音转文字
  - 实时语音识别
  - 多语言支持
  - 语音命令

**实现示例**（参考 Claude Code Read 工具）：
```typescript
// 图像上传和处理
async function handleImageUpload(file: File) {
  // 读取图像
  const imageData = await readImageFile(file)

  // 发送给 Agent（参考 Claude Code 图像支持）
  const response = await agent.sendMessage({
    role: 'user',
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.type,
          data: imageData
        }
      },
      {
        type: 'text',
        text: '请根据这个 UI 设计创建对应的 Flow'
      }
    ]
  })
}
```

### 13.6 高级调试功能（参考 Claude Code 调试能力）

**Claude Code 调试参考**：
- 完善的错误处理（2,512 个 try-catch）
- 性能监控
- 日志系统

**KAL-AI IDE 高级调试**：
- AI 辅助调试
  - 智能断点（基于条件）
  - 变量监控（自动识别关键变量）
  - 异常预测（提前发现潜在问题）
- 时间旅行调试
  - 回放任意时刻
  - 状态对比
  - 变更追踪
- 性能分析
  - Token 用量分析（参考 Claude Code Token 计数）
  - 节点耗时分析
  - 缓存命中率
  - 瓶颈识别

### 13.7 代码生成优化（参考 Claude Code 工具系统）

**Claude Code 代码生成参考**：
- 精确的 Edit 工具（字符串替换）
- Diff 显示
- 类型检查（4,679 次 typeof 检查）

**KAL-AI IDE 代码生成优化**：
- 更准确的代码生成
  - 基于项目上下文
  - 基于用户风格
  - 基于最佳实践
- 代码审查
  - 自动检查常见错误
  - 性能优化建议
  - 安全漏洞检测
- 重构支持
  - 智能重命名
  - 提取函数
  - 优化结构

### 13.8 多语言支持（参考 Claude Code 国际化）

**Claude Code 多语言参考**：
- 支持多种编程语言（TypeScript、Python、Go 等）
- Tree-sitter 代码解析（205 KB WASM）

**KAL-AI IDE 多语言支持**：
- UI 多语言
  - 中文、英文、日文等
  - 动态切换
  - 本地化
- 编程语言支持
  - TypeScript（主要）
  - JavaScript
  - Python（未来）
- 自然语言支持
  - 多语言对话
  - 多语言文档
  - 多语言提示词

### 13.9 企业功能（参考 Claude Code 企业特性）

**Claude Code 企业参考**：
- OAuth 2.0 认证（544 次引用）
- API Key 管理
- 权限控制（1,486 次引用）

**KAL-AI IDE 企业功能**：
- 团队管理
  - 用户权限
  - 角色管理
  - 审计日志
- 私有部署
  - 本地 MCP Server
  - 私有 AI 模型
  - 数据隔离
- 安全合规
  - 数据加密
  - 访问控制
  - 合规审计

### 13.10 性能优化（参考 Claude Code 优化策略）

**Claude Code 性能优化参考**：
- Prompt Caching（90% 成本节省）
- 并行执行（Promise.all，233 次引用）
- 连接池管理
- 缓存策略（5 分钟有效期）

**KAL-AI IDE 持续优化**：
- 更快的响应速度
  - 预加载常用资源
  - 智能预测用户操作
  - 边缘计算
- 更低的成本
  - 更激进的 Prompt Caching
  - 模型选择优化（Haiku for simple tasks）
  - 批量操作优化
- 更好的用户体验
  - 更流畅的动画
  - 更快的加载
  - 更智能的提示

## 附录 A：MCP Server 开发指南（参考 Claude Code MCP 实现）

### A.1 MCP Server 架构

```
Kal devkit MCP Server（参考 Claude Code MCP 服务器）
├── Server Core
│   ├── MCP Protocol Handler (处理 MCP 协议消息)
│   ├── Tool Registry (工具注册表)
│   ├── Event Emitter (事件发射器)
│   └── State Manager (状态管理器)
├── Services (封装 @kal-ai/devkit)
│   ├── FlowEditorService
│   ├── SimulatorService
│   ├── ReplayerService
│   ├── InspectorService
│   └── ProjectService
└── Tools (MCP Tool Definitions)
    ├── Flow Tools (create_flow, add_node, etc.)
    ├── Debug Tools (run_simulation, etc.)
    └── Project Tools (list_flows, etc.)
```

### A.2 Service 设计模式（参考 Claude Code 服务架构）

每个 Service 封装一个 Kal devkit 模块，提供：
- **初始化**：创建 devkit 实例
- **工具方法**：对应 MCP 工具的实现
- **事件发射**：操作完成后发射事件
- **状态管理**：维护 Service 内部状态
- **错误处理**：完善的 try-catch 和错误恢复

**示例：FlowEditorService**（参考 Claude Code 实现模式）
```typescript
class FlowEditorService {
  private editor: FlowEditor
  private eventEmitter: EventEmitter
  private stateCache: Map<string, FlowState> = new Map()

  constructor(eventEmitter: EventEmitter) {
    this.editor = createFlowEditor()
    this.eventEmitter = eventEmitter
  }

  async createFlow(args: { name: string; description?: string }) {
    try {
      const flow = { id: uuid(), name: args.name, nodes: [], edges: [] }
      this.editor.load(flow)

      // 缓存状态
      this.stateCache.set(flow.id, flow)

      // 发射事件（参考 Claude Code 事件发射）
      this.eventEmitter.emit('flow:created', { flowId: flow.id })

      return { success: true, flowId: flow.id }
    } catch (error) {
      // 错误处理（参考 Claude Code 错误处理）
      return {
        success: false,
        error: {
          code: 'FLOW_CREATION_FAILED',
          message: error.message
        }
      }
    }
  }

  async addNode(args: { flowId: string; nodeType: string; name: string; position?: Position }) {
    try {
      // 参数验证
      if (!this.stateCache.has(args.flowId)) {
        throw new Error(`Flow ${args.flowId} not found`)
      }

      // 添加节点
      const nodeId = this.editor.addNodeByType(args.nodeType, args.position)

      // 更新缓存
      const flow = this.stateCache.get(args.flowId)!
      flow.nodes.push({ id: nodeId, type: args.nodeType, name: args.name })

      // 发射事件（参考 Claude Code 事件系统）
      this.eventEmitter.emit('flow:node:added', {
        flowId: args.flowId,
        nodeId,
        nodeType: args.nodeType,
        position: args.position
      })

      return { success: true, nodeId }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NODE_ADDITION_FAILED',
          message: error.message,
          details: { flowId: args.flowId, nodeType: args.nodeType }
        }
      }
    }
  }

  // 批量操作（参考 Claude Code 并行优化）
  async addNodesBatch(args: { flowId: string; nodes: NodeConfig[] }) {
    try {
      const results = await Promise.all(
        args.nodes.map(node => this.addNode({ flowId: args.flowId, ...node }))
      )

      // 一次性发射事件
      this.eventEmitter.emit('flow:nodes:added:batch', {
        flowId: args.flowId,
        nodeIds: results.map(r => r.nodeId)
      })

      return { success: true, results }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BATCH_ADDITION_FAILED',
          message: error.message
        }
      }
    }
  }
}
```

### A.3 MCP 工具定义（参考 Claude Code 工具系统）

每个工具需要定义（参考 Claude Code 15+ 内置工具）：
- **name**：工具名称（唯一标识）
- **description**：工具功能描述（清晰、具体）
- **inputSchema**：参数 JSON Schema（完整的类型定义）
- **handler**：工具实现函数（包含错误处理）

**示例：add_node 工具**（参考 Claude Code Bash/Read/Write 工具设计）
```typescript
{
  name: 'add_node',
  description: '向 Flow 中添加节点。支持所有节点类型（ai.narrative, ai.dialogue, logic.branch, state.read, state.write 等）。',
  inputSchema: {
    type: 'object',
    properties: {
      flowId: {
        type: 'string',
        description: 'Flow ID（必需）'
      },
      nodeType: {
        type: 'string',
        description: '节点类型',
        enum: [
          'ai.narrative',
          'ai.dialogue',
          'logic.branch',
          'logic.loop',
          'state.read',
          'state.write',
          'interact.choice',
          'interact.input'
        ]
      },
      name: {
        type: 'string',
        description: '节点名称（用于标识和调试）'
      },
      config: {
        type: 'object',
        description: '节点配置（可选，根据节点类型不同）',
        properties: {
          prompt: { type: 'string', description: 'AI 节点的 prompt 模板' },
          model: { type: 'string', description: 'AI 节点使用的模型' },
          condition: { type: 'string', description: '分支节点的条件表达式' },
          statePath: { type: 'string', description: '状态节点的路径' }
        }
      },
      position: {
        type: 'object',
        description: '节点在画布上的位置（可选，默认自动布局）',
        properties: {
          x: { type: 'number', description: 'X 坐标' },
          y: { type: 'number', description: 'Y 坐标' }
        }
      }
    },
    required: ['flowId', 'nodeType', 'name']
  },
  handler: async (args) => {
    // 参考 Claude Code 工具实现模式
    try {
      // 1. 参数验证
      if (!args.flowId || !args.nodeType || !args.name) {
        throw new Error('Missing required parameters')
      }

      // 2. 执行操作
      const result = await flowEditorService.addNode(args)

      // 3. 返回结果
      return result
    } catch (error) {
      // 4. 错误处理（参考 Claude Code 错误格式）
      return {
        success: false,
        error: {
          code: 'ADD_NODE_FAILED',
          message: error.message,
          details: {
            flowId: args.flowId,
            nodeType: args.nodeType
          }
        }
      }
    }
  }
}
```

**工具分类**（参考 Claude Code 工具分类）：

1. **Flow 编辑工具**（类似 Claude Code 的 Read/Write/Edit）
   - `create_flow` - 创建新 Flow
   - `add_node` - 添加节点
   - `connect_nodes` - 连接端口
   - `update_node` - 更新节点配置
   - `remove_node` - 删除节点
   - `auto_layout` - 自动排列节点
   - `validate_flow` - 校验 Flow

2. **代码编辑工具**（类似 Claude Code 的文件操作）
   - `create_handler` - 创建节点 handler
   - `update_handler` - 修改 handler
   - `create_prompt_template` - 创建 prompt 模板
   - `read_file` - 读取文件
   - `write_file` - 写入文件

3. **调试与测试工具**（类似 Claude Code 的 Bash 工具）
   - `run_simulation` - 运行模拟测试
   - `replay_recording` - 回放录制
   - `inspect_state` - 检查游戏状态
   - `add_assertion` - 添加断言
   - `analyze_performance` - 性能分析

4. **项目管理工具**（类似 Claude Code 的 Glob/Grep）
   - `list_flows` - 列出所有 Flow
   - `search_nodes` - 搜索节点
   - `get_node_types` - 获取节点类型列表
   - `export_flow` - 导出 Flow JSON

### A.4 事件通知机制（参考 Claude Code 8800+ 事件监听器）

MCP Server 通过 MCP notifications 向 Client 发送事件：

```typescript
// Server 端发送事件（参考 Claude Code 事件发射）
class MCPServer {
  private connections: Map<string, Connection> = new Map()

  sendNotification(notification: Notification) {
    // 广播给所有连接的客户端
    this.connections.forEach(conn => {
      conn.send({
        jsonrpc: '2.0',
        method: 'notifications/event',
        params: notification
      })
    })
  }

  // 工具执行后发送事件
  async executeToolAndNotify(toolName: string, args: any) {
    try {
      const result = await this.executeTool(toolName, args)

      // 发送成功事件
      this.sendNotification({
        type: `tool:${toolName}:success`,
        data: result
      })

      return result
    } catch (error) {
      // 发送错误事件
      this.sendNotification({
        type: `tool:${toolName}:error`,
        data: {
          error: error.message,
          toolName,
          args
        }
      })

      throw error
    }
  }
}

// FlowEditorService 发送事件
class FlowEditorService {
  async addNode(args: AddNodeArgs) {
    const nodeId = this.editor.addNodeByType(args.nodeType, args.position)

    // 发送事件通知（参考 Claude Code 事件系统）
    this.mcpServer.sendNotification({
      type: 'flow:node:added',
      data: {
        flowId: args.flowId,
        nodeId,
        nodeType: args.nodeType,
        position: args.position,
        timestamp: Date.now()
      }
    })

    return { success: true, nodeId }
  }
}

// Client 端接收事件（参考 Claude Code 事件处理）
mcpClient.onNotification('notifications/event', (params) => {
  const { type, data } = params

  // 分发到 Event Bus
  eventBus.emit(type, data)

  // 记录事件日志
  console.log(`[MCP Event] ${type}:`, data)
})

// UI 组件订阅事件（参考 Claude Code UI 更新）
function FlowCanvas() {
  useEffect(() => {
    // 订阅节点添加事件
    const handleNodeAdded = (data: NodeAddedEvent) => {
      // 添加节点到 Canvas（带动画）
      addNodeWithAnimation(data.nodeId, data.position)

      // 更新状态
      setNodes(prev => [...prev, {
        id: data.nodeId,
        type: data.nodeType,
        position: data.position
      }])

      // 显示通知
      showNotification(`节点 "${data.nodeType}" 已添加`)
    }

    eventBus.on('flow:node:added', handleNodeAdded)

    return () => {
      eventBus.off('flow:node:added', handleNodeAdded)
    }
  }, [])

  return <ReactFlow nodes={nodes} edges={edges} />
}
```

**事件命名规范**（参考 Claude Code 事件命名）：
- 使用 `domain:action:status` 格式
- 例如：`flow:node:added`、`simulation:round:completed`、`tool:create_flow:success`
- 保持一致性和可预测性

### A.5 状态管理

MCP Server 需要维护：
- **当前 Flow 状态**：FlowEditor 的状态
- **模拟状态**：Simulator 运行状态
- **录制状态**：Replayer 加载的录制
- **项目状态**：文件树、Flow 列表

**状态持久化**：
- 使用文件系统存储 Flow JSON
- 使用内存存储运行时状态
- 支持状态快照和恢复

### A.6 错误处理

MCP 工具调用可能失败的情况：
- **参数错误**：返回详细的参数校验错误
- **操作失败**：返回操作失败原因（如端口不兼容）
- **状态冲突**：返回当前状态和期望状态的差异
- **系统错误**：返回堆栈信息（开发模式）

**错误响应格式**：
```typescript
{
  success: false,
  error: {
    code: 'PORT_INCOMPATIBLE',
    message: '端口类型不兼容',
    details: {
      fromPort: { type: 'string' },
      toPort: { type: 'number' }
    }
  }
}
```

### A.7 性能优化（参考 Claude Code 性能优化策略）

**批量操作**（参考 Claude Code 并行执行）：
```typescript
// 提供批量工具（减少 MCP 调用次数）
{
  name: 'add_nodes_batch',
  description: '批量添加多个节点（比单独添加更高效）',
  inputSchema: {
    type: 'object',
    properties: {
      flowId: { type: 'string' },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nodeType: { type: 'string' },
            name: { type: 'string' },
            config: { type: 'object' },
            position: { type: 'object' }
          }
        }
      }
    }
  },
  handler: async (args) => {
    // 并行添加节点（参考 Claude Code Promise.all）
    const results = await Promise.all(
      args.nodes.map(node =>
        flowEditorService.addNode({ flowId: args.flowId, ...node })
      )
    )

    // 一次性发射事件
    mcpServer.sendNotification({
      type: 'flow:nodes:added:batch',
      data: {
        flowId: args.flowId,
        nodeIds: results.map(r => r.nodeId),
        count: results.length
      }
    })

    return { success: true, results }
  }
}
```

**增量更新**（参考 Claude Code 流式响应）：
```typescript
// 只返回变化的部分
class FlowEditorService {
  private previousState: Map<string, FlowState> = new Map()

  async getFlowDiff(flowId: string): Promise<FlowDiff> {
    const currentState = this.editor.getState()
    const prevState = this.previousState.get(flowId)

    if (!prevState) {
      // 首次获取，返回完整状态
      this.previousState.set(flowId, currentState)
      return { type: 'full', data: currentState }
    }

    // 计算 diff（参考 Claude Code 增量更新）
    const diff = {
      type: 'incremental',
      addedNodes: currentState.nodes.filter(n =>
        !prevState.nodes.find(pn => pn.id === n.id)
      ),
      updatedNodes: currentState.nodes.filter(n => {
        const prevNode = prevState.nodes.find(pn => pn.id === n.id)
        return prevNode && !deepEqual(prevNode, n)
      }),
      removedNodes: prevState.nodes.filter(n =>
        !currentState.nodes.find(cn => cn.id === n.id)
      ).map(n => n.id)
    }

    this.previousState.set(flowId, currentState)
    return diff
  }
}
```

**缓存策略**（参考 Claude Code Prompt Caching）：
```typescript
// 缓存 Flow JSON
class FlowCache {
  private cache: Map<string, CacheEntry> = new Map()
  private ttl = 5 * 60 * 1000 // 5 分钟（参考 Claude Code 缓存有效期）

  async get(flowId: string): Promise<Flow | null> {
    const entry = this.cache.get(flowId)

    if (!entry) return null

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(flowId)
      return null
    }

    return entry.data
  }

  set(flowId: string, data: Flow) {
    this.cache.set(flowId, {
      data,
      timestamp: Date.now()
    })
  }

  invalidate(flowId: string) {
    this.cache.delete(flowId)
  }
}

// 使用缓存
class FlowEditorService {
  private cache = new FlowCache()

  async getFlow(flowId: string): Promise<Flow> {
    // 先查缓存
    const cached = await this.cache.get(flowId)
    if (cached) {
      return cached
    }

    // 缓存未命中，从文件系统读取
    const flow = await this.loadFlowFromFile(flowId)
    this.cache.set(flowId, flow)

    return flow
  }

  async updateFlow(flowId: string, updates: Partial<Flow>) {
    // 更新 Flow
    const flow = await this.getFlow(flowId)
    Object.assign(flow, updates)

    // 保存到文件系统
    await this.saveFlowToFile(flowId, flow)

    // 使缓存失效
    this.cache.invalidate(flowId)
  }
}
```

**连接池**（参考 Claude Code 连接管理）：
```typescript
// MCP 连接池（支持多个并发连接）
class MCPConnectionPool {
  private connections: Connection[] = []
  private maxConnections = 5
  private currentIndex = 0

  async getConnection(): Promise<Connection> {
    if (this.connections.length < this.maxConnections) {
      // 创建新连接
      const conn = await this.createConnection()
      this.connections.push(conn)
      return conn
    }

    // 轮询使用现有连接
    const conn = this.connections[this.currentIndex]
    this.currentIndex = (this.currentIndex + 1) % this.connections.length
    return conn
  }

  private async createConnection(): Promise<Connection> {
    const conn = await mcpClient.connect()

    // 监听连接关闭
    conn.on('close', () => {
      const index = this.connections.indexOf(conn)
      if (index > -1) {
        this.connections.splice(index, 1)
      }
    })

    return conn
  }
}
```

**性能监控**（参考 Claude Code 性能追踪）：
```typescript
// 工具执行性能监控
class PerformanceMonitor {
  private metrics: Map<string, ToolMetrics> = new Map()

  async measureTool<T>(
    toolName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now()
    const startMemory = process.memoryUsage().heapUsed

    try {
      const result = await fn()
      const duration = performance.now() - startTime
      const memoryDelta = process.memoryUsage().heapUsed - startMemory

      // 记录指标
      this.recordMetrics(toolName, {
        duration,
        memoryDelta,
        success: true
      })

      return result
    } catch (error) {
      const duration = performance.now() - startTime

      this.recordMetrics(toolName, {
        duration,
        success: false,
        error: error.message
      })

      throw error
    }
  }

  private recordMetrics(toolName: string, metrics: Metrics) {
    const existing = this.metrics.get(toolName) || {
      calls: 0,
      totalDuration: 0,
      avgDuration: 0,
      errors: 0
    }

    existing.calls++
    existing.totalDuration += metrics.duration
    existing.avgDuration = existing.totalDuration / existing.calls
    if (!metrics.success) existing.errors++

    this.metrics.set(toolName, existing)
  }

  getMetrics(toolName?: string) {
    if (toolName) {
      return this.metrics.get(toolName)
    }
    return Object.fromEntries(this.metrics)
  }
}

// 使用性能监控
const perfMonitor = new PerformanceMonitor()

async function executeToolWithMonitoring(toolName: string, args: any) {
  return await perfMonitor.measureTool(toolName, async () => {
    return await executeTool(toolName, args)
  })
}
```

## 附录 B：部署方案

### B.1 本地开发模式

```bash
# 启动 MCP Server
cd packages/devkit-mcp-server
bun run dev

# 启动 IDE
cd packages/ide
bun run dev
```

**配置 MCP 连接**：
```typescript
// IDE 配置
const mcpClient = createMcpClient({
  transport: {
    type: 'stdio',
    command: 'bun',
    args: ['run', '../devkit-mcp-server/src/index.ts']
  }
})
```

### B.2 生产部署

**方案 1：本地 MCP Server**
- MCP Server 随 IDE 一起打包
- 作为子进程启动
- 适合桌面应用（Electron）

**方案 2：远程 MCP Server**
- MCP Server 部署到服务器
- 通过 SSE 或 WebSocket 连接
- 适合多用户场景

**方案 3：混合模式**
- 默认使用本地 MCP Server
- 支持连接远程 MCP Server
- 用户可选择

### B.3 Docker 部署

```dockerfile
# Dockerfile for MCP Server
FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install

COPY . .

EXPOSE 3000

CMD ["bun", "run", "start"]
```

```bash
# 构建和运行
docker build -t kal-devkit-mcp-server .
docker run -p 3000:3000 kal-devkit-mcp-server
```

### B.4 安全考虑

**API Key 管理**：
- IDE 不存储 API Key
- 通过环境变量或配置文件
- 支持 API Key 代理服务

**MCP Server 权限**：
- 文件系统访问限制
- 资源使用限制（CPU、内存）
- 操作审计日志

**网络安全**：
- HTTPS/WSS 加密传输
- Token 认证
- CORS 配置

## 附录 C：测试策略

### C.1 单元测试

**MCP Server 测试**：
- Service 方法测试
- 工具定义测试
- 事件发射测试

**IDE 测试**：
- Agent 对话测试（mock MCP）
- UI 组件测试
- 状态管理测试

### C.2 集成测试

**MCP 通信测试**：
- Client-Server 连接测试
- 工具调用测试
- 事件通知测试

**端到端测试**：
- 用户对话 → Agent 操作 → UI 更新
- 手动操作 → MCP 同步 → Agent 感知
- 错误处理和恢复

### C.3 性能测试

**MCP Server 性能**：
- 工具调用延迟
- 并发处理能力
- 内存占用

**IDE 性能**：
- 首屏加载时间
- Agent 响应时间
- UI 渲染性能

### C.4 用户测试

**可用性测试**：
- 新手用户完成任务时间
- 错误率和恢复时间
- 用户满意度

**A/B 测试**：
- Agent 提示词优化
- UI 布局优化
- 交互流程优化

## 附录 D：常见问题

### D.1 MCP Server 连接失败

**问题**：IDE 无法连接 MCP Server

**排查**：
1. 检查 MCP Server 是否启动
2. 检查连接配置（command、args）
3. 检查防火墙和端口
4. 查看 MCP Server 日志

**解决**：
- 使用 `stdio` transport（本地开发）
- 使用 `sse` transport（远程部署）
- 配置自动重连

### D.2 Agent 工具调用失败

**问题**：Agent 调用 MCP 工具返回错误

**排查**：
1. 检查工具参数是否正确
2. 检查 MCP Server 日志
3. 检查 FlowEditor 状态
4. 检查权限和资源

**解决**：
- 返回详细错误信息给 Agent
- Agent 根据错误调整策略
- 提供用户手动干预选项

### D.3 UI 更新不及时

**问题**：Agent 操作后 UI 没有更新

**排查**：
1. 检查 MCP 事件是否发射
2. 检查 Event Bus 是否订阅
3. 检查 UI 组件是否重新渲染
4. 检查状态管理是否更新

**解决**：
- 确保 MCP Server 发射事件
- 确保 UI 订阅正确的事件
- 使用 React DevTools 调试

### D.4 性能问题

**问题**：IDE 响应缓慢

**排查**：
1. 检查 MCP 调用延迟
2. 检查 Agent 响应时间
3. 检查 UI 渲染性能
4. 检查内存占用

**解决**：
- 使用批量操作减少 MCP 调用
- 优化 Agent 提示词长度
- 使用虚拟滚动优化列表渲染
- 使用 Web Worker 处理计算密集任务

## 附录 E：参考资源

### E.1 相关文档

- [MCP 协议规范](https://modelcontextprotocol.io/docs)
- [@kal-ai/core 文档](./core-dev-guide.md)
- [@kal-ai/devkit 文档](./devkit-dev-guide.md)
- [@kal-ai/orchestrate 文档](./orchestrate-dev-guide.md)
- [Claude Code CLI 分析报告](../claude-code-analysis/README.md)

### E.2 技术栈文档

- [React 18](https://react.dev/)
- [React Flow](https://reactflow.dev/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Anthropic API](https://docs.anthropic.com/)

### E.3 示例项目（参考实现）

- **Claude Code CLI**（参考 Agent 交互、工具系统、流式处理）
  - 11.27 MB 单文件部署
  - 1,428 个 async 函数
  - 2,512 个 try-catch 块
  - 8,884 个事件监听器
  - 15+ 内置工具
  - 完善的权限管理
  - SSE 流式响应
  - MCP 协议集成
- Cursor IDE（参考 Agent 交互）
- VS Code（参考 UI 布局）
- Flowise（参考 Flow 编辑器）

### E.4 开发工具

- Bun（包管理和运行时）
- Vite（构建工具）
- Vitest（测试框架）
- Playwright（E2E 测试）
- React DevTools（调试工具）

### E.5 Claude Code 核心技术参考

**架构设计**：
- 事件驱动架构（8,884 个事件监听器）
- 流式处理（SSE + ReadableStream）
- 异步处理（1,428 个 async 函数，4,888 次 await）
- 错误处理（2,512 个 try-catch 块）

**工具系统**：
- 15+ 内置工具（Bash, Read, Write, Edit, Glob, Grep, Task, WebFetch, WebSearch, AskUserQuestion 等）
- 工具调用流程（权限检查 → 执行 → 返回结果）
- 并行工具调用（Promise.all）
- 后台任务支持（run_in_background）

**权限管理**：
- 多级权限模式（auto, prompt, allowed-prompts, custom）
- 语义匹配（allowed-prompts 基于语义而非精确匹配）
- 用户可配置

**上下文管理**：
- Token 计数（input/output/cached tokens）
- 自动压缩（80% 阈值触发）
- Prompt Caching（90% 成本节省）
- 对话历史持久化

**MCP 集成**：
- 33+ MCP 服务器引用
- stdio 和 SSE 传输支持
- 工具注册和调用
- 事件通知机制

**性能优化**：
- Prompt Caching（5 分钟有效期）
- 并行执行（Promise.all）
- 增量更新（diff 算法）
- 连接池管理

### E.6 学习路径

**快速入门**（1 周）：
1. 学习 React 18 基础
2. 学习 Zustand 状态管理
3. 学习 MCP 协议基础
4. 阅读 Claude Code 分析报告（核心部分）

**深入学习**（2-3 周）：
1. 学习 SSE 流式处理
2. 学习 @kal-ai/core 使用
3. 学习 React Flow 使用
4. 学习 Monaco Editor 集成
5. 阅读 Claude Code 完整分析报告

**实战开发**（4-6 周）：
1. 搭建基础框架
2. 实现 MCP Server
3. 实现 Agent 核心
4. 实现 UI 组件
5. 集成和测试

### E.7 最佳实践总结（来自 Claude Code）

**代码质量**：
- 大量使用 TypeScript 类型检查（4,679 次 typeof 检查）
- 完善的错误处理（2,512 个 try-catch 块）
- 现代数据结构（Map, Set, WeakMap）
- 异步处理优化（Promise.all, Promise.race）

**架构设计**：
- 事件驱动（松耦合、可扩展）
- 流式处理（实时反馈、降低 TTFB）
- 模块化（清晰的职责划分）
- 可扩展（MCP、Skills、Hooks）

**用户体验**：
- 流式响应（实时显示输出）
- 权限管理（安全可控）
- 错误提示（清晰友好）
- 性能优化（快速响应）

**开发效率**：
- 单文件部署（简化分发）
- 配置驱动（灵活可定制）
- 插件系统（易于扩展）
- 完善文档（降低学习成本）

---

**分析完成日期**: 2026-02-27
**参考版本**: Claude Code CLI v2.1.62
**分析工具**: Claude Sonnet 4.6
**文档版本**: v2.0（基于 Claude Code 分析优化）
