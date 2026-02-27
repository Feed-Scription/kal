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

## 一、架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      KAL-AI IDE (Web)                        │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (React)                                            │
│  ├── Chat Interface (主交互界面 - Agent 对话)                │
│  ├── Layout Manager (面板布局、拖拽调整)                      │
│  ├── Flow Canvas (可视化 Flow - 展示 Agent 成果)             │
│  ├── Code Editor (Monaco Editor - 展示生成的代码)            │
│  ├── Debugger (调试器 + 回放器 - 展示测试结果)                │
│  ├── State Inspector (状态检查器)                            │
│  └── Context Panel (项目上下文、文件树)                       │
├─────────────────────────────────────────────────────────────┤
│  Agent Layer (基于 Kal 实现)                                 │
│  ├── Kal Agent Core (@kal-ai/core)                          │
│  │   ├── Model (Claude API)                                 │
│  │   ├── Tools (MCP Client)                                 │
│  │   └── State Manager                                      │
│  ├── MCP Client (连接 Kal devkit MCP Server)                │
│  ├── Context Manager (对话上下文管理)                        │
│  └── Event Bus (Agent 操作 → UI 更新)                       │
├─────────────────────────────────────────────────────────────┤
│  State Management (Zustand)                                 │
│  ├── Agent State (对话历史、工具调用)                         │
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

**关键设计点**：

1. **Agent 基于 Kal 实现**：
   - 使用 `@kal-ai/core` 的 Model 调用 Claude API
   - 使用 `@kal-ai/core` 的 Tools 注册和调用 MCP 工具
   - Agent 本质是一个 Kal 应用

2. **MCP 协议连接**：
   - Kal devkit 作为 MCP Server 运行
   - IDE 的 Agent 作为 MCP Client 连接
   - 所有 Flow 编辑、调试、测试能力通过 MCP 暴露

3. **双向通信**：
   - Agent → MCP Server：调用工具（add_node、run_simulation 等）
   - MCP Server → Agent：返回结果、触发事件
   - Agent → UI：通过 Event Bus 触发 UI 更新

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

### 1.3 数据流

```
用户输入
  ↓
Chat Interface
  ↓
Kal Agent (@kal-ai/core)
  ↓
MCP Client (调用工具)
  ↓
MCP Server (Kal devkit)
  ↓
FlowEditor / Simulator / Replayer
  ↓
返回结果
  ↓
Agent 处理结果
  ↓
Event Bus 触发 UI 更新
  ↓
Flow Canvas / Code Editor / Debugger 更新显示
```

## 二、核心功能设计

### 2.1 Chat Interface（主交互界面）

**功能清单**：
- 对话历史展示（用户消息、Agent 响应、工具调用）
- 流式响应（实时显示 Agent 输出）
- 工具调用可视化（卡片展示工具名称、参数、结果）
- 多行输入、快捷键支持
- 中断执行、重新生成
- 上下文提示（当前 Flow、选中节点）

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

### 4.1 Agent 工作流程

```
用户输入 ("帮我创建一个叙事生成的 Flow")
  ↓
Kal Agent 理解意图 (使用 @kal-ai/core Model)
  ↓
Agent 规划操作 (决定调用哪些 MCP 工具)
  ↓
MCP Client 调用工具 (create_flow, add_node)
  ↓
MCP Server (Kal devkit) 执行操作
  ↓
FlowEditor 创建节点、连线
  ↓
MCP Server 返回结果
  ↓
Agent 接收结果，触发 UI 更新事件
  ↓
Flow Canvas 实时显示新节点（高亮动画）
  ↓
Agent 返回响应 ("已创建 Flow，包含 1 个叙事节点")
  ↓
用户确认/继续对话 ("再添加一个分支节点")
```

**关键点**：
- Agent 使用 `@kal-ai/core` 的 Model 进行对话
- Agent 使用 `@kal-ai/core` 的 Tools 注册 MCP 工具
- 所有 Flow 操作通过 MCP 协议调用 Kal devkit
- MCP Server 运行在独立进程，可以是本地或远程

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

### 4.3 Agent 系统提示词

```
你是 KAL-AI IDE 的 AI 助手，专门帮助开发者创建和调试 AI 游戏的 Flow。

## 你的能力

1. **Flow 设计**：创建节点、连接端口、配置参数、自动布局
2. **代码编写**：生成 handler 函数、prompt 模板（TypeScript）
3. **调试测试**：运行模拟、回放录制、性能分析
4. **项目管理**：文件操作、Flow 管理、节点搜索

## 工作原则

1. **理解优先**：先理解用户需求，再规划操作
2. **渐进式**：一次做一个主要操作，避免过于复杂
3. **可视化**：操作会实时显示在 IDE 界面上
4. **最佳实践**：
   - Flow 设计避免环
   - 端口类型要匹配
   - 代码符合 TypeScript 规范
   - 合理使用 State 管理
5. **主动建议**：发现问题主动提出优化方案

## 典型场景

### 场景 1：创建新 Flow
用户："帮我创建一个 RPG 叙事生成的 Flow"
你的操作：
1. create_flow(name="RPG 叙事生成")
2. add_node(nodeType="ai.narrative", name="生成场景描述")
3. add_node(nodeType="state.write", name="保存叙事")
4. connect_nodes(...)
5. 向用户解释 Flow 结构

### 场景 2：调试问题
用户："为什么我的 Flow 运行失败了？"
你的操作：
1. validate_flow() 检查错误
2. 如果有环或端口不匹配，指出问题
3. run_simulation() 运行测试
4. inspect_state() 检查状态
5. 提供修复建议

### 场景 3：优化性能
用户："Token 用量太高了"
你的操作：
1. analyze_performance() 分析瓶颈
2. 检查 prompt 是否过长
3. 建议使用缓存或优化 prompt
4. 修改节点配置
```

### 4.4 上下文管理

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

**上下文压缩**：
- 保留最近 10 轮对话
- 早期对话做摘要
- 工具调用结果只保留摘要
- 用户可手动清空上下文

## 五、状态管理

使用 Zustand 管理全局状态。

### 5.1 状态结构

```typescript
interface IDEStore {
  // Agent 状态
  agent: {
    conversationHistory: Message[]
    isProcessing: boolean
    currentToolCall: ToolCall | null
    mcpConnected: boolean  // MCP Server 连接状态
  }

  // 项目状态
  project: {
    current: Project | null
    flows: Flow[]
    fileTree: FileNode[]
  }

  // 编辑器状态（从 MCP Server 同步）
  editor: {
    currentFlow: Flow | null
    selectedNodes: string[]
    selectedEdges: string[]
    validation: ValidationResult
  }

  // 调试状态（从 MCP Server 同步）
  debug: {
    isRunning: boolean
    recording: Recording | null
    currentFrame: RecordingFrame | null
  }

  // UI 状态
  ui: {
    activeView: ViewId
    panelVisibility: Record<PanelId, boolean>
    theme: 'light' | 'dark'
  }
}
```

### 5.2 关键操作

**Agent 操作**：
- `sendMessage(message: string)` - 发送消息给 Kal Agent
- `connectMCP(serverUrl: string)` - 连接 MCP Server
- `disconnectMCP()` - 断开 MCP Server

**MCP 工具调用**：
- `callMCPTool(toolName, args)` - 调用 MCP 工具
- `subscribeMCPEvents()` - 订阅 MCP Server 事件

**UI 操作**：
- `loadFlow(flowId: string)` - 加载 Flow（触发 MCP 工具）
- `updateNode(nodeId, patch)` - 更新节点（触发 MCP 工具）
- `startDebug()` - 开始调试（触发 MCP 工具）
- `togglePanel(panelId)` - 切换面板可见性

### 5.3 状态同步

**MCP Server → IDE**：
- MCP Server 执行操作后，通过事件通知 IDE
- IDE 更新本地状态（editor、debug）
- UI 自动重新渲染

**IDE → MCP Server**：
- 用户手动操作（拖拽节点、编辑代码）
- IDE 调用 MCP 工具同步到 Server
- Server 返回确认，IDE 更新状态

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
- **MCP Server 基础**（2 天）
  - MCP 协议实现
  - Server 启动和连接管理
  - 工具注册机制
- **FlowEditor Service**（2 天）
  - 封装 @kal-ai/devkit FlowEditor
  - 实现 Flow 编辑工具（create_flow、add_node 等）
  - 状态管理和事件通知
- **Simulator/Replayer Service**（2 天）
  - 封装 Simulator 和 Replayer
  - 实现调试工具（run_simulation、replay_recording 等）
  - 录制管理
- **Project Service**（1 天）
  - 文件系统操作
  - 项目管理工具

### Phase 3：Agent 核心（5 天）
- **Kal Agent 实现**（3 天）
  - 基于 @kal-ai/core 创建 Agent
  - Model 配置（Claude API）
  - 对话历史管理
  - 流式响应处理
- **MCP Client 集成**（2 天）
  - MCP Client 封装
  - 工具注册和调用
  - 事件订阅和处理

### Phase 4：可视化面板（7 天）
- **Flow Canvas**（3 天）
  - React Flow 集成
  - 自定义节点组件
  - 实时更新和动画
- **Code Editor**（2 天）
  - Monaco Editor 集成
  - TypeScript 支持
  - Diff 显示
- **Debugger**（2 天）
  - 调试控制器
  - 状态检查器
  - 回放控制

### Phase 5：UI 集成与联动（5 天）
- **Chat Interface**（2 天）
  - 对话界面
  - 工具调用可视化
  - 流式响应显示
- **面板联动**（2 天）
  - MCP 事件 → UI 更新
  - 动画效果
  - 状态同步
- **Context Panel**（1 天）
  - 文件树
  - Flow 列表
  - 上下文显示

### Phase 6：优化与测试（3 天）
- 上下文管理优化
- 错误处理和重试
- MCP 连接稳定性
- 性能优化
- 用户测试

**总计：30 天**

**并行开发建议**：
- Phase 2（MCP Server）和 Phase 3（Agent）可以部分并行
- Phase 4（可视化面板）可以在 Phase 3 完成后立即开始
- 建议 2-3 人团队：1 人负责 MCP Server，1 人负责 Agent，1 人负责 UI

## 八、技术选型

| 功能 | 技术方案 | 理由 |
|------|---------|------|
| UI 框架 | React 18 | 生态成熟、组件丰富 |
| 状态管理 | Zustand | 轻量、简单、TypeScript 友好 |
| 构建工具 | Vite | 快速、现代、开箱即用 |
| Flow 渲染 | React Flow | 专业的流程图库、可定制性强 |
| 代码编辑器 | Monaco Editor | VS Code 同款、功能完整 |
| 布局系统 | react-mosaic-component | 可拖拽面板、灵活布局 |
| 文件系统 | File System Access API | 浏览器原生、无需后端 |
| Git | isomorphic-git | 纯 JS 实现、浏览器可用 |
| 样式 | Tailwind CSS | 快速开发、一致性好 |
| 组件库 | shadcn/ui | 现代、可定制、TypeScript |
| **Agent 实现** | **@kal-ai/core** | **Kal 框架，Model + Tools 能力** |
| **能力提供** | **MCP Server** | **标准协议，解耦 IDE 和 Kal** |
| **MCP 协议** | **@modelcontextprotocol/sdk** | **官方 SDK，稳定可靠** |

### 8.1 为什么使用 MCP

**优势**：
1. **解耦**：IDE 和 Kal devkit 独立开发、独立部署
2. **标准化**：MCP 是标准协议，未来可以接入其他工具
3. **灵活性**：MCP Server 可以本地运行或远程部署
4. **可扩展**：容易添加新工具，不需要修改 IDE 代码
5. **安全性**：MCP Server 可以做权限控制和沙箱隔离

**架构对比**：

```
传统方式（直接调用）：
IDE → @kal-ai/devkit (直接 import)
- 紧耦合
- 难以独立部署
- 版本升级困难

MCP 方式（协议调用）：
IDE → MCP Client → MCP Server → @kal-ai/devkit
- 松耦合
- 独立部署
- 版本独立升级
- 支持远程调用
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

### 10.2 Agent 基于 Kal 实现

**Kal Agent 架构**：
```typescript
// 使用 @kal-ai/core 创建 Agent
import { createKalCore } from '@kal-ai/core'
import { createMcpClient } from '@modelcontextprotocol/sdk'

const core = createKalCore({
  models: {
    default: {
      modelId: 'claude-3-5-sonnet-20241022',
      apiKey: process.env.CLAUDE_API_KEY,
    }
  }
})

// 连接 MCP Server
const mcpClient = createMcpClient({
  transport: {
    type: 'stdio',
    command: 'kal-devkit-mcp-server',
  }
})

await mcpClient.connect()

// 注册 MCP 工具到 Kal
const mcpTools = await mcpClient.listTools()
mcpTools.forEach(tool => {
  core.tools.register(tool, async (args) => {
    return await mcpClient.callTool(tool.name, args)
  })
})

// Agent 对话
const response = await core.runWithTools({
  messages: [{ role: 'user', content: '创建一个叙事 Flow' }],
  maxRounds: 10,
})
```

**关键点**：
- Agent 使用 `@kal-ai/core` 的 Model 能力
- Agent 使用 `@kal-ai/core` 的 Tools 能力
- MCP 工具通过 `core.tools.register()` 注册
- Agent 自动调用 MCP 工具完成任务

### 10.3 实时同步机制

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

**事件类型**：
- `flow:node:added` - 节点已添加
- `flow:node:updated` - 节点已更新
- `flow:edge:added` - 连线已添加
- `simulation:started` - 模拟已开始
- `simulation:round` - 模拟回合更新
- `simulation:completed` - 模拟已完成

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

### 10.6 错误处理

**MCP 工具调用失败**：
- MCP Client 捕获错误
- 返回详细错误信息给 Agent
- Agent 根据错误调整策略
- 在 Chat 中向用户说明问题

**MCP Server 断线**：
- MCP Client 检测连接状态
- 自动重连（可配置）
- 显示连接状态指示器
- 提示用户检查 MCP Server

**用户撤销操作**：
- 基于 FlowEditor 的 undo/redo
- 通过 MCP 工具调用 `undo_last_action`
- UI 同步更新

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

## 十三、未来扩展

### 13.1 协作功能
- 多人同时编辑 Flow
- Agent 作为团队助手
- 操作历史和版本控制

### 13.2 学习能力
- Agent 学习用户习惯
- 记住项目特定的约定
- 提供个性化建议

### 13.3 插件系统
- 自定义 Agent 工具
- 扩展节点类型
- 集成第三方服务

### 13.4 移动端
- 移动浏览器访问
- 简化的 Chat 界面
- 查看和审批 Agent 操作

### 13.5 多模态输入
- 用户上传截图 → Agent 理解 UI 设计
- 用户上传文档 → Agent 提取游戏规则
- 语音输入 → 语音转文字

## 附录 A：MCP Server 开发指南

### A.1 MCP Server 架构

```
Kal devkit MCP Server
├── Server Core
│   ├── MCP Protocol Handler
│   ├── Tool Registry
│   ├── Event Emitter
│   └── State Manager
├── Services (封装 @kal-ai/devkit)
│   ├── FlowEditorService
│   ├── SimulatorService
│   ├── ReplayerService
│   ├── InspectorService
│   └── ProjectService
└── Tools (MCP Tool Definitions)
    ├── Flow Tools
    ├── Debug Tools
    └── Project Tools
```

### A.2 Service 设计模式

每个 Service 封装一个 Kal devkit 模块，提供：
- **初始化**：创建 devkit 实例
- **工具方法**：对应 MCP 工具的实现
- **事件发射**：操作完成后发射事件
- **状态管理**：维护 Service 内部状态

**示例：FlowEditorService**
```typescript
class FlowEditorService {
  private editor: FlowEditor
  private eventEmitter: EventEmitter

  constructor(eventEmitter: EventEmitter) {
    this.editor = createFlowEditor()
    this.eventEmitter = eventEmitter
  }

  async createFlow(args: { name: string; description?: string }) {
    const flow = { id: uuid(), name: args.name, nodes: [], edges: [] }
    this.editor.load(flow)
    
    // 发射事件
    this.eventEmitter.emit('flow:created', { flowId: flow.id })
    
    return { success: true, flowId: flow.id }
  }

  async addNode(args: { flowId: string; nodeType: string; ... }) {
    const nodeId = this.editor.addNodeByType(args.nodeType, args.position)
    
    // 发射事件
    this.eventEmitter.emit('flow:node:added', { 
      flowId: args.flowId, 
      nodeId,
      nodeType: args.nodeType 
    })
    
    return { success: true, nodeId }
  }
}
```

### A.3 MCP 工具定义

每个工具需要定义：
- **name**：工具名称（唯一标识）
- **description**：工具功能描述
- **inputSchema**：参数 JSON Schema
- **handler**：工具实现函数

**示例：add_node 工具**
```typescript
{
  name: 'add_node',
  description: '向 Flow 中添加节点',
  inputSchema: {
    type: 'object',
    properties: {
      flowId: { type: 'string', description: 'Flow ID' },
      nodeType: { 
        type: 'string', 
        description: '节点类型',
        enum: ['ai.narrative', 'ai.dialogue', 'logic.branch', ...]
      },
      name: { type: 'string', description: '节点名称' },
      config: { type: 'object', description: '节点配置' },
      position: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' }
        }
      }
    },
    required: ['flowId', 'nodeType', 'name']
  },
  handler: async (args) => {
    return await flowEditorService.addNode(args)
  }
}
```

### A.4 事件通知机制

MCP Server 通过 MCP notifications 向 Client 发送事件：

```typescript
// Server 端发送事件
server.sendNotification({
  method: 'notifications/event',
  params: {
    type: 'flow:node:added',
    data: {
      flowId: 'flow-123',
      nodeId: 'node-456',
      nodeType: 'ai.narrative'
    }
  }
})

// Client 端接收事件
mcpClient.onNotification('notifications/event', (params) => {
  eventBus.emit(params.type, params.data)
})
```

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

### A.7 性能优化

**批量操作**：
- 提供批量工具（如 `add_nodes_batch`）
- 减少 MCP 调用次数
- 一次性发射事件

**增量更新**：
- 只返回变化的部分
- 使用 diff 算法
- 减少数据传输量

**缓存策略**：
- 缓存 Flow JSON
- 缓存节点类型列表
- 缓存校验结果

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

### E.2 技术栈文档

- [React 18](https://react.dev/)
- [React Flow](https://reactflow.dev/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [Tailwind CSS](https://tailwindcss.com/)

### E.3 示例项目

- Cursor IDE（参考 Agent 交互）
- Claude Code（参考工具调用）
- VS Code（参考 UI 布局）
- Flowise（参考 Flow 编辑器）

### E.4 开发工具

- Bun（包管理和运行时）
- Vite（构建工具）
- Vitest（测试框架）
- Playwright（E2E 测试）
- React DevTools（调试工具）
