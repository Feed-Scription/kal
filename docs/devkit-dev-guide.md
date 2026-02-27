# @kal-ai/devkit 开发文档

## Context

`@kal-ai/devkit` 提供 AI 游戏的开发者工具链，核心解决"AI 游戏难以测试"的痛点。包含运行器（Runner）、模拟玩家（Simulator）、录制回放（Recorder/Replayer）、质量断言（Inspector）、A/B 测试和 Flow 编辑器核心逻辑等能力。

**核心特点**：
- **纯逻辑层**：所有模块都是纯 TypeScript 实现，不包含 UI
- **MCP 集成**：通过 MCP Server 暴露能力，供 IDE 和其他工具使用
- **框架无关**：editor 模块提供核心逻辑，UI 层由独立项目实现

依赖：`@kal-ai/core`（Model、StateManager）+ `@kal-ai/orchestrate`（FlowExecutor）。

### 会议共识（2026-02-24）

- Simulator 本质是一个 agent 循环，模拟人的行为来自动化测试
- Simulator 可以跑十几二十个版本，晚上自动跑，第二天检查结果
- Recorder/Replayer 和 Simulator 属于整体测试工具的一部分
- A/B Prompt 测试和 A/B Model 测试可以在 Simulator 的 agent 循环中运行
- Inspector 用于打断言，检查生成内容的质量分布
- **Editor 模块只提供核心逻辑（无 UI）**，UI 层由 IDE 项目实现
- **devkit 通过 MCP Server 暴露能力**，供 IDE 的 Agent 调用
- 振华（zhliu）负责 agent 和开发者工具开发，后期打主力

## 一、模块划分

| 模块 | 职责 | 对外暴露 | UI 层 |
|------|------|----------|-------|
| `runner` | Flow/KalCore 运行器，命令行执行入口 | FlowRunner | 无 UI |
| `simulator` | 模拟玩家 agent，自动化测试循环 | Simulator, PlayerAgent | 无 UI |
| `recorder` | 录制游戏会话（状态快照 + 事件流） | Recorder | 无 UI |
| `replayer` | 回放录制的会话，支持断点 | Replayer | 无 UI |
| `inspector` | 质量断言引擎，检查 AI 输出 | Inspector, Assertion | 无 UI |
| `ab-test` | A/B Prompt 和 A/B Model 对比测试 | ABTestRunner | 无 UI |
| `editor` | Flow 编辑器核心逻辑（无 UI） | EditorState, FlowEditor | **UI 由 IDE 实现** |
| `mcp-server` | MCP Server 封装（可选） | MCP Tools | 通过 MCP 协议暴露 |

**关键说明**：
- 所有模块都是纯逻辑层，不包含任何 UI 代码
- `editor` 模块提供状态管理、操作接口、校验逻辑，但不涉及渲染
- UI 层（React Flow、Monaco Editor 等）由 IDE 项目实现
- MCP Server 是可选的封装层，用于暴露 devkit 能力给 IDE Agent

## 二、目录结构

```
packages/devkit/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── runner.ts
│   │   ├── simulator.ts
│   │   ├── recording.ts
│   │   ├── inspector.ts
│   │   └── ab-test.ts
│   ├── runner/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   └── flow-runner.ts
│   ├── simulator/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── simulator.ts
│   │   └── player-agent.ts
│   ├── recorder/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   └── recorder.ts
│   ├── replayer/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   └── replayer.ts
│   ├── inspector/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── inspector.ts
│   │   └── assertions.ts
│   └── ab-test/
│       ├── index.ts
│       ├── interfaces.ts
│       └── ab-test-runner.ts
│   └── editor/
│       ├── index.ts
│       ├── interfaces.ts
│       ├── editor-state.ts    # 编辑器状态管理（节点增删改、连线、撤销重做）
│       ├── flow-editor.ts     # 编辑器核心逻辑
│       └── layout.ts          # 自动布局算法
└── __tests__/
    ├── runner/
    ├── simulator/
    ├── recorder/
    ├── replayer/
    ├── inspector/
    ├── ab-test/
    └── editor/
```

## 三、核心接口定义

### 3.0 错误类型

```typescript
// types/errors.ts
import { KalError } from '@kal-ai/core'

export class SimulationError extends KalError {
  constructor(message: string, readonly round: number, cause?: unknown) {
    super(message, 'SIMULATION_ERROR', cause)
    this.name = 'SimulationError'
  }
}

export class AssertionError extends KalError {
  constructor(message: string, readonly assertionId: string, cause?: unknown) {
    super(message, 'ASSERTION_ERROR', cause)
    this.name = 'AssertionError'
  }
}
```

> 所有 devkit 错误继承自 core 的 `KalError`，可统一用 `instanceof KalError` 捕获。`SimulationError` 在 `roundTimeoutMs` 超时时抛出（`exitReason: 'timeout'`）。断言失败不抛出异常，结果记录在 `AssertionResult.passed` 中；只有断言函数本身执行出错时才抛 `AssertionError`。

### 3.1 runner — Flow 运行器

```typescript
// runner/interfaces.ts

import type { KalCore } from '@kal-ai/core'
import type { FlowDefinition, FlowResult, FlowExecutor } from '@kal-ai/orchestrate'

/** 运行器配置 */
export interface FlowRunnerOptions {
  readonly core: KalCore
  /** Flow JSON 文件路径或 FlowDefinition 对象 */
  readonly flow: string | FlowDefinition
  /** handler 注册（JSON 模式下需要） */
  readonly handlers?: Readonly<Record<string, (ctx: unknown) => Promise<unknown>>>
  /** 运行完成后是否输出摘要 */
  readonly summary?: boolean
  /** 事件回调 */
  readonly onEvent?: (event: import('@kal-ai/orchestrate').FlowEvent) => void
}

/** Flow 运行器 — 一键加载并执行 Flow */
export interface FlowRunner {
  /** 加载 Flow（从文件路径或对象） */
  load(options: FlowRunnerOptions): Promise<FlowExecutor>

  /** 加载并立即执行，返回最终结果 */
  run(options: FlowRunnerOptions): Promise<FlowRunResult>
}

export interface FlowRunResult {
  readonly flowResult: FlowResult
  readonly duration: number
  readonly summary?: string
}
```

### 3.2 simulator — 模拟玩家

```typescript
// simulator/interfaces.ts

import type { KalCore, ModelConfig } from '@kal-ai/core'
import type { FlowDefinition, FlowExecutor } from '@kal-ai/orchestrate'

/** 玩家行为策略 — 定义模拟玩家如何做决策 */
export interface PlayerStrategy {
  readonly name: string
  /** 根据当前游戏状态和可选动作，返回玩家的选择 */
  decide(ctx: PlayerDecisionContext): Promise<PlayerAction>
}

export interface PlayerDecisionContext {
  readonly state: Readonly<Record<string, unknown>>
  readonly prompt: string
  readonly availableActions?: readonly string[]
  readonly history: readonly PlayerAction[]
  readonly round: number
}

export interface PlayerAction {
  readonly type: string
  readonly payload: unknown
  readonly timestamp: number
}

/** 内置策略：用大模型模拟玩家决策 */
export interface LLMPlayerStrategyOptions {
  /** KalCore 实例（策略内部用于调用模型） */
  readonly core: import('@kal-ai/core').KalCore
  /** 使用的模型名（对应 KalCoreOptions.models 中的 key） */
  readonly model?: string
  /** 玩家人设（系统 prompt） */
  readonly persona?: string
  readonly temperature?: number
}

export function createLLMPlayerStrategy(options: LLMPlayerStrategyOptions): PlayerStrategy

/** 内置策略：随机选择 */
export function createRandomStrategy(): PlayerStrategy

/** 内置策略：按脚本执行 */
export function createScriptedStrategy(actions: readonly PlayerAction[]): PlayerStrategy

/** 模拟会话配置 */
export interface SimulationConfig {
  readonly core: KalCore
  readonly flow: string | FlowDefinition
  readonly strategy: PlayerStrategy
  /** 最大回合数 */
  readonly maxRounds: number
  /** 单回合超时（ms） */
  readonly roundTimeoutMs?: number
  /** 是否录制（自动启用 Recorder） */
  readonly record?: boolean
  /** 回合回调 */
  readonly onRound?: (event: SimulationRoundEvent) => void
  /** 断言列表（每回合结束后检查，所有回合完成后汇总到 SimulationResult.assertionResults） */
  readonly assertions?: readonly import('../inspector/interfaces').Assertion[]
}

export interface SimulationRoundEvent {
  readonly round: number
  readonly action: PlayerAction
  readonly stateAfter: Readonly<Record<string, unknown>>
  readonly nodeResults: Readonly<Record<string, unknown>>
  readonly duration: number
}

/** 模拟结果 */
export interface SimulationResult {
  readonly rounds: readonly SimulationRoundEvent[]
  readonly totalRounds: number
  readonly totalDuration: number
  readonly finalState: Readonly<Record<string, unknown>>
  readonly recording?: import('../recorder/interfaces').Recording
  readonly assertionResults?: readonly import('../inspector/interfaces').AssertionResult[]
  readonly usage: import('@kal-ai/core').TokenUsage
  /**
   * 模拟是否正常完成。
   * - 'completed'：所有回合正常结束
   * - 'aborted'：调用了 abort()
   * - 'timeout'：某回合超过 roundTimeoutMs
   * - 'flow_failed'：某回合的 Flow 执行失败（FlowResult.status === 'failed'）
   */
  readonly exitReason: 'completed' | 'aborted' | 'timeout' | 'flow_failed'
  /** exitReason 为 'flow_failed' 时，记录失败回合的 FlowResult */
  readonly failedFlowResult?: import('@kal-ai/orchestrate').FlowResult
}

/** 模拟器 — 运行自动化测试循环 */
export interface Simulator {
  /** 运行单次模拟 */
  run(config: SimulationConfig): Promise<SimulationResult>

  /** 批量运行（多个配置并行） */
  runBatch(configs: readonly SimulationConfig[]): Promise<readonly SimulationResult[]>

  /** 取消正在运行的模拟 */
  abort(): void
}
```

### 3.3 recorder — 录制

```typescript
// recorder/interfaces.ts

import type { StateChangeEvent } from '@kal-ai/core'
import type { FlowEvent } from '@kal-ai/orchestrate'

/** 录制帧 — 一个时间点的快照 */
export interface RecordingFrame {
  readonly timestamp: number
  readonly round: number
  readonly stateSnapshot: Readonly<Record<string, unknown>>
  readonly stateChanges: readonly StateChangeEvent[]
  readonly flowEvents: readonly FlowEvent[]
  readonly playerAction?: import('../simulator/interfaces').PlayerAction
  readonly nodeOutputs: Readonly<Record<string, unknown>>
}

/** 完整录制 */
export interface Recording {
  readonly id: string
  readonly flowId: string
  readonly startedAt: number
  readonly completedAt?: number
  readonly frames: readonly RecordingFrame[]
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** 录制器 */
export interface Recorder {
  /** 开始录制 */
  start(flowId: string, metadata?: Record<string, unknown>): void

  /** 记录一帧（timestamp 由框架自动填充为 Date.now()） */
  capture(frame: Omit<RecordingFrame, 'timestamp'>): void

  /** 停止录制并返回完整录制 */
  stop(): Recording

  /** 导出为 JSON */
  export(recording: Recording): string

  /** 从 JSON 导入 */
  import(json: string): Recording

  /** 当前是否在录制 */
  readonly active: boolean
}
```

### 3.4 replayer — 回放

```typescript
// replayer/interfaces.ts

import type { Recording, RecordingFrame } from '../recorder/interfaces'

/**
 * 回放速度：
 * - 数字倍速（0.5/1/2/4）：按帧间时间戳差值缩放，onFrame 回调按比例延迟触发
 * - 'instant'：忽略时间戳，同步遍历所有帧，onFrame 回调逐帧同步触发，play() 立即 resolve
 */
export type ReplaySpeed = 0.5 | 1 | 2 | 4 | 'instant'

export interface ReplayerOptions {
  readonly recording: Recording
  readonly speed?: ReplaySpeed
  readonly onFrame?: (frame: RecordingFrame, index: number) => void
  readonly onComplete?: () => void
}

/** 回放器 */
export interface Replayer {
  /** 加载录制 */
  load(recording: Recording): void

  /** 开始回放 */
  play(options?: { speed?: ReplaySpeed }): Promise<void>

  /** 暂停 */
  pause(): void

  /** 恢复 */
  resume(): void

  /** 跳转到指定帧 */
  seekTo(frameIndex: number): RecordingFrame

  /** 跳转到指定回合 */
  seekToRound(round: number): RecordingFrame

  /** 单步前进 */
  stepForward(): RecordingFrame | undefined

  /** 单步后退 */
  stepBackward(): RecordingFrame | undefined

  /** 获取当前帧 */
  readonly currentFrame: RecordingFrame | undefined
  readonly currentIndex: number
  readonly totalFrames: number
  readonly playing: boolean

  /** 订阅帧变化 */
  onFrame(listener: (frame: RecordingFrame, index: number) => void): () => void
}
```

### 3.5 inspector — 质量断言

```typescript
// inspector/interfaces.ts

/** 断言类型 */
export type AssertionKind =
  | 'state'       // 检查 State 字段值
  | 'output'      // 检查节点输出内容
  | 'usage'       // 检查 Token 用量
  | 'latency'     // 检查响应延迟
  | 'custom'      // 自定义断言函数

/** 断言定义 */
export interface Assertion {
  readonly id: string
  readonly name: string
  readonly kind: AssertionKind
  /**
   * 断言检查函数。返回值不需要包含 assertionId，框架会自动从 Assertion.id 填充。
   * 开发者只需返回 passed、message 和可选的 actual/expected。
   */
  readonly check: (ctx: AssertionContext) => Omit<AssertionResult, 'assertionId'>
}

export interface AssertionContext {
  readonly state: Readonly<Record<string, unknown>>
  readonly nodeOutputs: Readonly<Record<string, unknown>>
  readonly usage: import('@kal-ai/core').TokenUsage
  /** 本回合挂钟时间（ms），从 Flow.start() 到 Flow.wait() resolve */
  readonly latencyMs: number
  readonly round: number
}

export interface AssertionResult {
  readonly assertionId: string
  readonly passed: boolean
  readonly message: string
  readonly actual?: unknown
  readonly expected?: unknown
}

/** 内置断言工厂 */
export interface AssertionBuilders {
  /** State 字段存在且满足条件 */
  stateField(path: string, predicate: (value: unknown) => boolean, message?: string): Assertion

  /** State 数值在范围内 */
  stateRange(path: string, min: number, max: number): Assertion

  /** 节点输出包含关键词 */
  outputContains(nodeId: string, keywords: readonly string[]): Assertion

  /** 节点输出不包含关键词（安全检查） */
  outputExcludes(nodeId: string, keywords: readonly string[]): Assertion

  /** 节点输出可解析为 JSON */
  outputIsJson(nodeId: string): Assertion

  /** 单回合 Token 用量上限 */
  maxTokens(limit: number): Assertion

  /** 单回合延迟上限 */
  maxLatency(limitMs: number): Assertion

  /** 自定义断言 */
  custom(id: string, name: string, check: (ctx: AssertionContext) => AssertionResult): Assertion
}

/** 检查器 — 批量运行断言并汇总 */
export interface Inspector {
  /** 添加断言 */
  add(assertion: Assertion): void
  addAll(assertions: readonly Assertion[]): void

  /** 对单帧运行所有断言 */
  check(ctx: AssertionContext): readonly AssertionResult[]

  /** 对整个模拟结果运行断言，返回汇总报告 */
  inspect(simulation: import('../simulator/interfaces').SimulationResult): InspectionReport
}

export interface InspectionReport {
  readonly totalAssertions: number
  readonly passed: number
  readonly failed: number
  readonly results: readonly AssertionResult[]
  /** 按断言 ID 分组的通过率 */
  readonly passRateById: Readonly<Record<string, number>>
}
```

### 3.6 ab-test — A/B 测试

```typescript
// ab-test/interfaces.ts

import type { SimulationConfig, SimulationResult } from '../simulator/interfaces'
import type { InspectionReport } from '../inspector/interfaces'

/** A/B 测试变体 */
export interface ABVariant {
  readonly name: string
  /** 覆盖 SimulationConfig 中的部分配置 */
  readonly overrides: Partial<Pick<SimulationConfig, 'flow' | 'strategy'>>
  /** 覆盖模型配置（A/B Model 测试） */
  readonly modelOverrides?: Readonly<Record<string, import('@kal-ai/core').ModelConfig>>
}

/** A/B 测试配置 */
export interface ABTestConfig {
  readonly name: string
  /** 基准配置 */
  readonly baseline: SimulationConfig
  /** 变体列表 */
  readonly variants: readonly ABVariant[]
  /** 每个变体运行次数（统计显著性） */
  readonly runsPerVariant?: number
  /** 断言列表 */
  readonly assertions?: readonly import('../inspector/interfaces').Assertion[]
}

/** 单个变体的汇总结果 */
export interface ABVariantResult {
  readonly variantName: string
  readonly runs: readonly SimulationResult[]
  readonly inspection: InspectionReport
  readonly avgDuration: number
  readonly avgTokens: number
  readonly passRate: number
}

/** A/B 测试完整结果 */
export interface ABTestResult {
  readonly name: string
  readonly baseline: ABVariantResult
  readonly variants: readonly ABVariantResult[]
  readonly comparison: readonly ABComparison[]
}

export interface ABComparison {
  readonly variantName: string
  readonly vsBaseline: {
    /** 通过率差值（绝对值，如 0.05 表示高 5 个百分点） */
    readonly passRateDiff: number
    /** 平均耗时差值（ms，正值表示比 baseline 慢） */
    readonly avgDurationDiff: number
    /** 平均 Token 用量差值（正值表示比 baseline 多） */
    readonly avgTokensDiff: number
  }
}

/** A/B 测试运行器 */
export interface ABTestRunner {
  run(config: ABTestConfig): Promise<ABTestResult>
  abort(): void
}
```

### 3.7 editor — Flow 编辑器核心逻辑（无 UI）

Editor 模块提供与 UI 框架无关的编辑器核心逻辑（纯 TypeScript），**不包含任何 UI 渲染代码**。UI 层（React Flow、Canvas 等）由 IDE 项目实现。

> **设计原则**：
> - editor 模块只管数据和操作（节点增删改、端口连线、撤销重做、校验、布局计算）
> - 不涉及任何 DOM/Canvas 渲染、React 组件、CSS 样式
> - UI 层通过订阅 `EditorState` 的变化来驱动渲染
> - 编辑器采用端口-中心数据流模型，连线在端口之间建立，而非节点之间
> - **通过 MCP Server 暴露给 IDE Agent**，Agent 通过 MCP 工具操作 Flow

**与 IDE 的关系**：
```
IDE (React Flow UI)
  ↓ 订阅状态
EditorState (devkit/editor)
  ↑ 调用操作
FlowEditor API (devkit/editor)
  ↑ MCP 工具调用
MCP Server (devkit-mcp-server)
  ↑ MCP 协议
IDE Agent (@kal-ai/core)
```

```typescript
// editor/interfaces.ts

import type {
  FlowJson, FlowNodeJson, FlowGraphValidation,
  PortDefinition, PortDataType, PortCompatibility,
  PortConnectionJson, NodeTypeRegistry, NodeTypeDefinition,
  NodeCategory,
} from '@kal-ai/orchestrate'

/** 编辑器中的端口（运行时 UI 状态） */
export interface EditorPort {
  readonly name: string
  readonly type: PortDataType
  readonly direction: 'input' | 'output'
  readonly description?: string
  readonly required?: boolean
  /** 是否已连接 */
  readonly connected: boolean
  /** 鼠标悬停高亮 */
  readonly highlighted?: boolean
}

/** 编辑器中的节点（FlowNodeJson + UI 状态 + 解析后的端口） */
export interface EditorNode extends FlowNodeJson {
  readonly selected?: boolean
  readonly dragging?: boolean
  /** 解析后的输入端口列表（来自 NodeTypeRegistry 或节点自身定义） */
  readonly inputPorts: readonly EditorPort[]
  /** 解析后的输出端口列表 */
  readonly outputPorts: readonly EditorPort[]
  /** 节点类型元信息（来自 NodeTypeRegistry） */
  readonly typeDef?: NodeTypeDefinition
}

/** 编辑器中的连线（端口级别） */
export interface EditorEdge {
  readonly id: string
  readonly fromNode: string
  readonly fromPort: string
  readonly toNode: string
  readonly toPort: string
  readonly selected?: boolean
  /** 端口类型兼容性（用于渲染连线颜色/样式） */
  readonly compatibility: PortCompatibility
}

/** 编辑器操作（用于撤销重做） */
export type EditorAction =
  | { readonly type: 'node:add'; readonly node: FlowNodeJson }
  | { readonly type: 'node:remove'; readonly nodeId: string }
  | { readonly type: 'node:update'; readonly nodeId: string; readonly patch: Partial<FlowNodeJson> }
  | { readonly type: 'node:move'; readonly nodeId: string; readonly position: { x: number; y: number } }
  | { readonly type: 'edge:add'; readonly fromNode: string; readonly fromPort: string; readonly toNode: string; readonly toPort: string }
  | { readonly type: 'edge:remove'; readonly edgeId: string }
  | { readonly type: 'batch'; readonly actions: readonly EditorAction[] }

/** 编辑器状态 — 单一数据源 */
export interface EditorState {
  readonly flow: FlowJson
  readonly nodes: readonly EditorNode[]
  readonly edges: readonly EditorEdge[]
  readonly selection: readonly string[]
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** 校验结果，每次操作后自动更新 */
  readonly validation: FlowGraphValidation
  /**
   * 当前正在拖拽的连线（从某端口拖出，尚未连接）。
   * 生命周期：startConnection() 时创建，connect() 或 cancelConnection() 时清除。
   */
  readonly pendingConnection?: {
    readonly fromNode: string
    readonly fromPort: string
    readonly fromPortType: PortDataType
  }
}

/** 编辑器核心 */
export interface FlowEditor {
  /** 加载 Flow JSON */
  load(flow: FlowJson): void

  /** 绑定 NodeTypeRegistry（编辑器据此解析节点端口和属性面板） */
  setNodeTypeRegistry(registry: NodeTypeRegistry): void

  /**
   * 绑定 StateManager（编辑器据此对 state-ref 端口做路径自动补全）。
   * - 编辑器只读取 StateManager 的 schema（通过 getSchema()/getPaths()），不修改 state
   * - 绑定后，属性面板中 state-ref 类型的端口会展示可用路径列表
   * - StateManager 未提供 schema 时，路径自动补全不可用，但不影响其他编辑功能
   */
  setStateManager(state: import('@kal-ai/core').StateManager): void

  /** 获取当前状态快照 */
  getState(): EditorState

  /** 订阅状态变化（UI 层用于驱动渲染） */
  subscribe(listener: (state: EditorState) => void): () => void

  // ---- 节点操作 ----
  /** 从 NodeTypeRegistry 中按类型 ID 添加节点 */
  addNodeByType(typeId: string, position: { x: number; y: number }): string
  addNode(node: FlowNodeJson): void
  removeNode(nodeId: string): void
  updateNode(nodeId: string, patch: Partial<FlowNodeJson>): void
  moveNode(nodeId: string, position: { x: number; y: number }): void

  // ---- 端口连线操作 ----
  /** 连接两个端口（自动做类型校验，不兼容则拒绝） */
  connect(fromNode: string, fromPort: string, toNode: string, toPort: string): boolean
  /** 断开连线 */
  disconnect(edgeId: string): void
  /** 检查两个端口是否可连接（供 UI 拖拽时实时提示） */
  canConnect(fromNode: string, fromPort: string, toNode: string, toPort: string): PortCompatibility
  /** 开始拖拽连线（设置 pendingConnection） */
  startConnection(fromNode: string, fromPort: string): void
  /** 取消拖拽连线（清除 pendingConnection） */
  cancelConnection(): void

  // ---- 选择 ----
  select(ids: readonly string[]): void
  selectAll(): void
  clearSelection(): void

  // ---- 撤销重做 ----
  /**
   * 撤销上一个操作。历史记录基于 EditorAction 栈，每次操作自动入栈。
   * batch action 作为单个历史条目，整体撤销。
   * canUndo 为 false 时调用无效。
   */
  undo(): void
  /** 重做，canRedo 为 false 时调用无效 */
  redo(): void

  // ---- 校验 ----
  validate(): FlowGraphValidation

  // ---- 导入导出 ----
  toJson(): FlowJson
  fromJson(json: FlowJson): void

  // ---- 自动布局 ----
  autoLayout(): void

  // ---- 节点面板 ----
  /** 获取可用节点类型列表（供侧边栏节点面板渲染） */
  getAvailableNodeTypes(): readonly NodeTypeDefinition[]
  /** 按分类获取 */
  getNodeTypesByCategory(category: NodeCategory): readonly NodeTypeDefinition[]
  /** 搜索节点类型 */
  searchNodeTypes(query: string): readonly NodeTypeDefinition[]
}

/** 自动布局算法 */
export interface LayoutEngine {
  /** 根据 DAG 拓扑计算节点位置 */
  layout(
    nodes: readonly FlowNodeJson[],
    edges: readonly EditorEdge[]
  ): Readonly<Record<string, { x: number; y: number }>>
}

/** 创建编辑器实例 */
export function createFlowEditor(): FlowEditor
```

Editor 与 orchestrate 的关系：
- 读写同一份 `FlowJson` 格式，`FlowNodeJson.ui` 字段存储节点位置等 UI 元数据
- 通过 `NodeTypeRegistry` 获取节点的端口定义、可编辑参数、分类等元信息
- 连线操作基于端口类型校验（`checkPortCompatibility`），不兼容的端口无法连接
- 校验复用 orchestrate 的 `FlowGraph.validate()`（环检测、写冲突检测、端口类型校验）
- 运行时 executor 忽略 `ui` 字段，编辑器忽略 `handler` 的实际函数绑定

Editor 与 IDE 的关系：
- **devkit 提供核心逻辑**：FlowEditor 提供状态管理和操作接口
- **IDE 提供 UI 渲染**：使用 React Flow 渲染节点和连线
- **通过 MCP 连接**：IDE Agent 通过 MCP 工具调用 FlowEditor
- **状态同步**：FlowEditor 状态变化 → MCP 事件 → IDE UI 更新

### 3.8 工厂函数汇总

```typescript
// ---- runner ----
export function createFlowRunner(): FlowRunner

// ---- simulator ----
export function createSimulator(): Simulator
export function createLLMPlayerStrategy(options: LLMPlayerStrategyOptions): PlayerStrategy
export function createRandomStrategy(): PlayerStrategy
export function createScriptedStrategy(actions: readonly PlayerAction[]): PlayerStrategy

// ---- recorder / replayer ----
export function createRecorder(): Recorder
export function createReplayer(): Replayer

// ---- inspector ----
export function createInspector(): Inspector

/**
 * 内置断言工厂实例 — 直接作为命名导出使用
 * import { assertions } from '@kal-ai/devkit'
 * assertions.stateRange('player.hp', 0, 200)
 */
export const assertions: AssertionBuilders

// ---- ab-test ----
export function createABTestRunner(): ABTestRunner

// ---- editor ----
export function createFlowEditor(): FlowEditor
export function createLayoutEngine(): LayoutEngine
```

> 说明：`assertions` 是 `AssertionBuilders` 的预实例化常量，直接导出供开发者使用，无需手动 create。

## 四、模块间依赖关系

```
┌──────────────────────────────────────────────────┐
│                @kal-ai/devkit                     │
│                                                  │
│  types ◄── 所有模块都依赖                         │
│    ▲                                             │
│  recorder ── 依赖 types + core(State) + orchestrate(FlowEvent) │
│  replayer ── 依赖 types + recorder               │
│  inspector ── 依赖 types                          │
│  runner ── 依赖 types + core + orchestrate        │
│  simulator ── 依赖 types + core + orchestrate + recorder + inspector │
│  ab-test ── 依赖 types + simulator + inspector    │
│  editor ── 依赖 types + orchestrate(FlowJson, FlowGraph) │
│                                                  │
│  对外：createSimulator() / createABTestRunner()   │
│        createFlowEditor() (纯逻辑，无 UI)         │
│                                                  │
│  MCP Server (可选封装层)                          │
│  └── 暴露所有能力为 MCP Tools                     │
└──────────────────────────────────────────────────┘
```

核心依赖链：`recorder → simulator → ab-test`，inspector 是独立的断言引擎，被 simulator 和 ab-test 消费。

**MCP 集成**：
- devkit 的所有能力可以通过 MCP Server 暴露
- MCP Server 封装 FlowEditor、Simulator、Replayer 等
- IDE Agent 通过 MCP 协议调用这些能力
- 详见 `ide-dev-guide.md` 的 MCP Server 设计

## 五、典型使用场景

### 5.1 模拟玩家自动化测试

晚上启动 20 个模拟，第二天检查结果：

```typescript
import { createKalCore } from '@kal-ai/core'
import { createSimulator, createLLMPlayerStrategy } from '@kal-ai/devkit'
import { assertions } from '@kal-ai/devkit'

const core = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    }
  },
  state: {
    initialState: { player: { name: '勇者', hp: 100, level: 1 } }
  }
})

const simulator = createSimulator()

// 批量运行 20 次模拟
const configs = Array.from({ length: 20 }, (_, i) => ({
  core,
  flow: './flows/quarter-advance.json',
  strategy: createLLMPlayerStrategy({
    model: 'default',
    persona: `你是一个${i % 2 === 0 ? '激进' : '保守'}的玩家`,
  }),
  maxRounds: 10,
  record: true,
  assertions: [
    assertions.stateRange('player.hp', 0, 200),
    assertions.outputExcludes('narrative', ['undefined', 'null', 'error']),
    assertions.maxTokens(50000),
  ],
}))

const results = await simulator.runBatch(configs)

// 检查结果
for (const result of results) {
  const failed = result.assertionResults?.filter(r => !r.passed) ?? []
  if (failed.length > 0) {
    console.log(`模拟 ${result.totalRounds} 回合，${failed.length} 个断言失败:`)
    failed.forEach(f => console.log(`  - ${f.message}`))
  }
}
```

### 5.2 A/B Prompt 测试

对比两种 prompt 风格的生成质量：

```typescript
import { createABTestRunner } from '@kal-ai/devkit'

const runner = createABTestRunner()

const result = await runner.run({
  name: '叙事风格 A/B 测试',
  baseline: {
    core,
    flow: './flows/narrative-v1.json',
    strategy: createLLMPlayerStrategy({ model: 'default' }),
    maxRounds: 5,
  },
  variants: [
    {
      name: '详细叙事 prompt',
      overrides: { flow: './flows/narrative-v2-verbose.json' },
    },
    {
      name: '简洁叙事 prompt',
      overrides: { flow: './flows/narrative-v2-concise.json' },
    },
  ],
  runsPerVariant: 10,
  assertions: [
    assertions.outputContains('narrative', ['场景', '角色']),
    assertions.maxLatency(5000),
  ],
})

// 输出对比
for (const comp of result.comparison) {
  console.log(`${comp.variantName} vs baseline:`)
  console.log(`  通过率差异: ${comp.vsBaseline.passRateDiff > 0 ? '+' : ''}${(comp.vsBaseline.passRateDiff * 100).toFixed(1)}%`)
  console.log(`  平均耗时差异: ${comp.vsBaseline.avgDurationDiff > 0 ? '+' : ''}${comp.vsBaseline.avgDurationDiff.toFixed(0)}ms`)
  console.log(`  平均 Token 差异: ${comp.vsBaseline.avgTokensDiff > 0 ? '+' : ''}${comp.vsBaseline.avgTokensDiff.toFixed(0)}`)
}
```

### 5.3 录制回放调试

```typescript
import { createRecorder, createReplayer } from '@kal-ai/devkit'

// 录制
const recorder = createRecorder()
recorder.start('quarter-advance')
// ... 执行 Flow，每帧调用 recorder.capture(...)
const recording = recorder.stop()

// 保存
const json = recorder.export(recording)
fs.writeFileSync('session-001.json', json)

// 回放
const replayer = createReplayer()
replayer.load(recorder.import(json))

replayer.onFrame((frame, index) => {
  console.log(`帧 ${index}: 回合 ${frame.round}, 状态变更 ${frame.stateChanges.length} 条`)
})

// 跳到第 5 回合查看状态
const frame = replayer.seekToRound(5)
console.log('第 5 回合状态:', frame.stateSnapshot)
```

## 六、开发顺序与分工

### Phase 0：类型定义（1 天）
- 完成 `types/` 下所有类型文件
- 完成各模块 `interfaces.ts`

### Phase 1：基础工具（3 天，可并行）
| 任务 | 模块 | 前置依赖 |
|------|------|----------|
| 1A | runner — Flow 运行器 | core + orchestrate 可用 |
| 1B | recorder — 录制器 | core(StateChangeEvent) |
| 1C | inspector — 断言引擎 + 内置断言 | 无 |

### Phase 2：核心能力（4 天）
| 任务 | 模块 | 前置依赖 |
|------|------|----------|
| 2A | simulator/player-agent — 玩家策略 | core(Model) |
| 2B | simulator — 模拟循环引擎 | 1B(recorder) + 1C(inspector) + 2A |
| 2C | replayer — 回放器 | 1B(recorder) |

### Phase 3：高级功能（2 天）
| 任务 | 模块 | 前置依赖 |
|------|------|----------|
| 3A | ab-test — A/B 测试运行器 | 2B(simulator) + 1C(inspector) |
| 3B | simulator.runBatch — 批量模拟 | 2B |
| 3C | editor — 编辑器核心逻辑（状态管理、撤销重做） | orchestrate(FlowJson, FlowGraph) |
| 3D | editor/layout — 自动布局算法 | 3C |

### Phase 4：集成（1 天）
| 任务 |
|------|
| 4A 导出整理 + 构建配置 |
| 4B 集成测试 — 跑通青椒模拟器自动化测试 |
| 4C editor 集成测试 — 加载/编辑/导出 Flow JSON 往返一致性 |

关键路径：`Phase 0 → 1B(recorder) + 1C(inspector) → 2B(simulator) → 3A(ab-test) → 4B(集成测试)`

Editor 独立路径：`Phase 0 → 3C(editor 核心) → 3D(布局) → 4C(集成测试)`，可与 simulator 路径并行。

### 人力分配建议

devkit 主要由振华（zhliu）主导开发，依赖 core 和 orchestrate 的接口稳定后启动。建议：
- Phase 0 与 core/orchestrate 的 Phase 0 同步进行（只写类型）
- Phase 1 在 core Phase 2（Model 可用）后启动
- Phase 2-3 在 orchestrate Phase 2（FlowExecutor 可用）后启动
- **Editor 模块（3C/3D）**：
  - 振华负责核心逻辑实现（纯 TypeScript，无 UI）
  - editor 只依赖 orchestrate 的类型定义，不依赖 FlowExecutor 实现
  - 可以更早启动，与 simulator 路径并行
  - **UI 层由 IDE 项目实现**，不在 devkit 范围内

### MCP Server 开发（可选）

如果需要通过 MCP 暴露 devkit 能力给 IDE：
- **Phase 5：MCP Server 封装（3 天）**
  - 封装 FlowEditor、Simulator、Replayer 为 MCP Tools
  - 实现 MCP 协议通信
  - 事件通知机制
  - 详见 `ide-dev-guide.md` 附录 A

## 七、最小可用链路（MVP）

跑通"模拟玩家 3 回合 + 断言检查"：

```typescript
import { createKalCore } from '@kal-ai/core'
import {
  createSimulator,
  createRandomStrategy,
  assertions,
} from '@kal-ai/devkit'

const core = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    }
  },
  state: { initialState: { player: { hp: 100 } } }
})

const simulator = createSimulator()
const result = await simulator.run({
  core,
  flow: './flows/demo.json',
  strategy: createRandomStrategy(),
  maxRounds: 3,
  assertions: [
    assertions.stateRange('player.hp', 0, 200),
  ],
})

console.log(`完成 ${result.totalRounds} 回合，断言通过: ${
  result.assertionResults?.filter(r => r.passed).length
}/${result.assertionResults?.length}`)
```

## 八、验证方式

1. Phase 0 完成后：`tsc --noEmit` 通过
2. Phase 1 完成后：recorder 录制/导出、inspector 断言引擎单元测试通过
3. Phase 2 完成后：simulator 跑通 3 回合模拟 + 断言检查
4. Phase 3 完成后：A/B 测试运行器跑通 2 变体 × 3 次对比
5. Phase 4 完成后：青椒模拟器 10 回合自动化测试端到端通过

### 测试策略

**单元测试（vitest）**

```typescript
// inspector 断言引擎 — 纯函数，无需 mock
import { createInspector, assertions } from '@kal-ai/devkit'

const inspector = createInspector()
inspector.add(assertions.stateRange('player.hp', 0, 100))

const ctx: AssertionContext = {
  state: { 'player.hp': 80 },
  nodeOutputs: {},
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  latencyMs: 100,
  round: 1,
}
const results = inspector.check(ctx)
expect(results[0].passed).toBe(true)
```

**Simulator 集成测试（mock 模型）**

```typescript
// 用 ScriptedStrategy 避免真实 LLM 调用，确定性可重复
const result = await simulator.run({
  core,  // core 内部 model 已 mock
  flow: myFlowDef,
  strategy: createScriptedStrategy([
    { type: 'choice', payload: { actionId: 'attack' }, timestamp: 0 },
    { type: 'choice', payload: { actionId: 'defend' }, timestamp: 0 },
  ]),
  maxRounds: 2,
})
expect(result.exitReason).toBe('completed')
```

**Editor 往返一致性测试**

```typescript
// FlowJson 序列化/反序列化后内容不变
const editor = createFlowEditor()
editor.load(originalFlowJson)
editor.addNodeByType('ai.narrative', { x: 100, y: 100 })
const exported = editor.toJson()

// 重新加载，验证节点数量一致
const editor2 = createFlowEditor()
editor2.load(exported)
expect(editor2.getState().nodes.length).toBe(editor.getState().nodes.length)
```

## 九、与 IDE 的集成

### 9.1 核心关系

```
┌─────────────────────────────────────────────────┐
│                  KAL-AI IDE                      │
│                                                  │
│  UI Layer (React Flow, Monaco Editor)           │
│    ↓ 订阅状态                                     │
│  Local State (从 MCP 同步)                       │
│    ↑ 调用 MCP 工具                               │
│  MCP Client                                      │
│    ↑ MCP 协议                                    │
│  Agent (@kal-ai/core)                           │
└─────────────────────────────────────────────────┘
                    ↕ MCP Protocol
┌─────────────────────────────────────────────────┐
│            MCP Server (devkit-mcp-server)       │
│                                                  │
│  MCP Tools (create_flow, add_node, etc.)        │
│    ↓ 调用                                        │
│  @kal-ai/devkit                                 │
│    ├── FlowEditor (纯逻辑，无 UI)                │
│    ├── Simulator                                │
│    ├── Replayer                                 │
│    └── Inspector                                │
└─────────────────────────────────────────────────┘
```

### 9.2 职责划分

**@kal-ai/devkit 负责**：
- ✅ Flow 编辑核心逻辑（状态管理、操作接口、校验）
- ✅ 模拟测试引擎（Simulator、Replayer）
- ✅ 断言检查（Inspector）
- ✅ 自动布局算法（LayoutEngine）
- ❌ **不包含任何 UI 代码**

**IDE 项目负责**：
- ✅ UI 渲染（React Flow、Monaco Editor）
- ✅ 用户交互（拖拽、点击、输入）
- ✅ Agent 对话界面
- ✅ MCP Client 集成
- ✅ 动画和视觉效果

**MCP Server 负责**：
- ✅ 封装 devkit 能力为 MCP Tools
- ✅ 处理 MCP 协议通信
- ✅ 发送事件通知
- ✅ 状态管理和持久化

### 9.3 数据流

**Agent 创建节点的完整流程**：

```
1. 用户输入："添加一个叙事节点"
   ↓
2. IDE Agent 理解意图
   ↓
3. Agent 调用 MCP 工具：add_node({ nodeType: 'ai.narrative', ... })
   ↓
4. MCP Server 接收请求
   ↓
5. MCP Server 调用 FlowEditor.addNodeByType()
   ↓
6. FlowEditor 更新内部状态
   ↓
7. MCP Server 发送事件：flow:node:added
   ↓
8. IDE MCP Client 接收事件
   ↓
9. IDE 更新本地状态
   ↓
10. React Flow 重新渲染，显示新节点（带动画）
    ↓
11. Agent 返回响应："已添加叙事节点"
```

**用户手动操作的流程**：

```
1. 用户在 Canvas 上拖拽节点到新位置
   ↓
2. React Flow 触发 onNodeDragStop 事件
   ↓
3. IDE 调用 MCP 工具：update_node({ nodeId, position })
   ↓
4. MCP Server 调用 FlowEditor.moveNode()
   ↓
5. FlowEditor 更新状态
   ↓
6. MCP Server 发送事件：flow:node:updated
   ↓
7. IDE 确认同步完成
```

### 9.4 状态同步策略

**单向数据流**：
- FlowEditor 是唯一的 Source of Truth
- IDE 的状态是 FlowEditor 状态的镜像
- 所有修改都通过 MCP 工具同步到 FlowEditor

**乐观更新**：
- IDE 可以先更新本地 UI（乐观更新）
- 然后调用 MCP 工具同步
- 如果 MCP 调用失败，回滚本地状态

**事件驱动**：
- MCP Server 在操作完成后发送事件
- IDE 订阅事件并更新 UI
- 支持多客户端同步（未来协作功能）

### 9.5 Editor 模块的使用方式

**方式 1：直接使用（无 MCP）**

适用于命令行工具、脚本、测试：

```typescript
import { createFlowEditor } from '@kal-ai/devkit'

const editor = createFlowEditor()
editor.load(flowJson)

// 添加节点
const nodeId = editor.addNodeByType('ai.narrative', { x: 100, y: 100 })

// 连接节点
editor.connect(nodeId, 'output', targetNodeId, 'input')

// 校验
const validation = editor.validate()

// 导出
const flowJson = editor.toJson()
```

**方式 2：通过 MCP（推荐用于 IDE）**

适用于 IDE、远程工具、多用户场景：

```typescript
// MCP Server 端
import { createFlowEditor } from '@kal-ai/devkit'

const editor = createFlowEditor()

mcpServer.registerTool({
  name: 'add_node',
  handler: async (args) => {
    const nodeId = editor.addNodeByType(args.nodeType, args.position)
    
    // 发送事件
    mcpServer.sendNotification({
      method: 'notifications/event',
      params: {
        type: 'flow:node:added',
        data: { nodeId, nodeType: args.nodeType }
      }
    })
    
    return { success: true, nodeId }
  }
})

// IDE 端
const result = await mcpClient.callTool('add_node', {
  nodeType: 'ai.narrative',
  position: { x: 100, y: 100 }
})
```

### 9.6 Editor 状态订阅

IDE 可以订阅 FlowEditor 的状态变化（如果直接使用）：

```typescript
const editor = createFlowEditor()

// 订阅状态变化
const unsubscribe = editor.subscribe((state) => {
  // state: EditorState
  console.log('节点数量:', state.nodes.length)
  console.log('连线数量:', state.edges.length)
  console.log('校验结果:', state.validation)
  
  // 更新 React 状态
  setEditorState(state)
})

// 取消订阅
unsubscribe()
```

但在 MCP 模式下，IDE 通过 MCP 事件获取状态变化，不直接订阅 FlowEditor。

### 9.7 与其他 devkit 模块的集成

**Simulator 集成**：

```typescript
// MCP Server 端
mcpServer.registerTool({
  name: 'run_simulation',
  handler: async (args) => {
    const simulator = createSimulator()
    const flow = editor.toJson()
    
    const result = await simulator.run({
      core,
      flow,
      strategy: createLLMPlayerStrategy({ core, model: 'default' }),
      maxRounds: args.maxRounds,
      record: true,
      onRound: (event) => {
        // 发送回合事件
        mcpServer.sendNotification({
          method: 'notifications/event',
          params: {
            type: 'simulation:round',
            data: event
          }
        })
      }
    })
    
    return result
  }
})
```

**Replayer 集成**：

```typescript
// MCP Server 端
const replayer = createReplayer()

mcpServer.registerTool({
  name: 'replay_recording',
  handler: async (args) => {
    replayer.load(recording)
    
    replayer.onFrame((frame, index) => {
      // 发送帧事件
      mcpServer.sendNotification({
        method: 'notifications/event',
        params: {
          type: 'replay:frame',
          data: { frame, index }
        }
      })
    })
    
    await replayer.play({ speed: args.speed })
    
    return { success: true }
  }
})
```

## 十、最佳实践

### 10.1 Editor 使用建议

**DO**：
- ✅ 使用 `subscribe()` 监听状态变化
- ✅ 使用 `validate()` 在操作后检查合法性
- ✅ 使用 `undo()/redo()` 提供撤销功能
- ✅ 使用 `autoLayout()` 自动排列节点
- ✅ 通过 `NodeTypeRegistry` 获取节点元信息

**DON'T**：
- ❌ 不要直接修改 `EditorState`（只读）
- ❌ 不要绕过 FlowEditor API 直接修改 FlowJson
- ❌ 不要在 devkit 中写 UI 代码
- ❌ 不要假设 UI 框架（React/Vue/Angular）

### 10.2 MCP Server 开发建议

**DO**：
- ✅ 每个操作完成后发送事件通知
- ✅ 返回详细的错误信息
- ✅ 支持批量操作减少调用次数
- ✅ 实现状态持久化
- ✅ 提供健康检查接口

**DON'T**：
- ❌ 不要在 MCP Server 中实现业务逻辑（应在 devkit 中）
- ❌ 不要阻塞事件循环（使用异步操作）
- ❌ 不要忽略错误处理
- ❌ 不要在事件中发送大量数据（使用增量更新）

### 10.3 IDE 集成建议

**DO**：
- ✅ 使用乐观更新提升响应速度
- ✅ 订阅 MCP 事件并更新 UI
- ✅ 缓存 FlowEditor 状态减少 MCP 调用
- ✅ 使用动画展示状态变化
- ✅ 提供离线模式（本地 FlowEditor）

**DON'T**：
- ❌ 不要频繁调用 MCP 工具（合并操作）
- ❌ 不要忽略 MCP 连接状态
- ❌ 不要在 UI 层实现 Flow 校验逻辑（应调用 MCP）
- ❌ 不要假设 MCP Server 总是可用

## 十一、扩展阅读

### 11.1 相关文档

- [IDE 开发文档](./ide-dev-guide.md) - IDE 架构和 MCP 集成
- [Core 开发文档](./core-dev-guide.md) - Model、Tools、State 等核心能力
- [Orchestrate 开发文档](./orchestrate-dev-guide.md) - Flow 执行引擎

### 11.2 MCP 协议

- [MCP 官方文档](https://modelcontextprotocol.io/docs)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- MCP Server 开发指南见 `ide-dev-guide.md` 附录 A

### 11.3 示例代码

**Editor 基础使用**：

```typescript
import { createFlowEditor } from '@kal-ai/devkit'
import { createNodeTypeRegistry } from '@kal-ai/orchestrate'

// 创建编辑器
const editor = createFlowEditor()

// 绑定节点类型注册表
const registry = createNodeTypeRegistry()
editor.setNodeTypeRegistry(registry)

// 加载 Flow
editor.load({
  id: 'my-flow',
  name: 'My Flow',
  nodes: [],
  edges: []
})

// 添加节点
const narrativeNodeId = editor.addNodeByType('ai.narrative', { x: 100, y: 100 })
const stateNodeId = editor.addNodeByType('state.write', { x: 300, y: 100 })

// 连接节点
editor.connect(narrativeNodeId, 'output', stateNodeId, 'input')

// 校验
const validation = editor.validate()
if (!validation.valid) {
  console.error('Flow 校验失败:', validation.errors)
}

// 自动布局
editor.autoLayout()

// 导出
const flowJson = editor.toJson()
console.log('导出的 Flow:', flowJson)
```

**Simulator 基础使用**：

```typescript
import { createKalCore } from '@kal-ai/core'
import { createSimulator, createLLMPlayerStrategy, assertions } from '@kal-ai/devkit'

const core = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    }
  },
  state: { initialState: { player: { hp: 100 } } }
})

const simulator = createSimulator()

const result = await simulator.run({
  core,
  flow: flowJson,
  strategy: createLLMPlayerStrategy({
    core,
    model: 'default',
    persona: '你是一个谨慎的玩家'
  }),
  maxRounds: 10,
  record: true,
  assertions: [
    assertions.stateRange('player.hp', 0, 200),
    assertions.maxTokens(50000),
  ],
  onRound: (event) => {
    console.log(`回合 ${event.round}:`, event.action)
  }
})

console.log('模拟完成:', result.exitReason)
console.log('总回合数:', result.totalRounds)
console.log('断言通过:', result.assertionResults?.filter(r => r.passed).length)
```

### 11.4 常见问题

**Q: Editor 模块可以独立使用吗？**

A: 可以。Editor 是纯 TypeScript 实现，不依赖 MCP。可以在命令行工具、脚本、测试中直接使用。MCP 只是一个可选的封装层。

**Q: 如何在 IDE 中渲染 Flow？**

A: IDE 使用 React Flow 等 UI 库渲染。从 MCP 获取 EditorState，转换为 React Flow 的 nodes 和 edges 格式，然后渲染。详见 `ide-dev-guide.md`。

**Q: Editor 支持协作编辑吗？**

A: Editor 本身不支持，但可以通过 MCP Server 实现。多个 IDE 连接同一个 MCP Server，通过事件通知同步状态。

**Q: 如何扩展自定义节点类型？**

A: 在 `@kal-ai/orchestrate` 的 NodeTypeRegistry 中注册自定义节点类型。Editor 会自动识别并支持。

**Q: Simulator 可以并行运行吗？**

A: 可以。使用 `simulator.runBatch()` 并行运行多个模拟。每个模拟使用独立的 KalCore 实例。

**Q: 如何调试 Flow 执行？**

A: 使用 Recorder 录制执行过程，然后用 Replayer 回放。可以单步执行、查看每帧的状态和节点输出。
