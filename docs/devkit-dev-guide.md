# @kal-ai/devkit 开发文档

## Context

`@kal-ai/devkit` 提供 AI 游戏的开发者工具链，核心解决"AI 游戏难以测试"的痛点。包含运行器（Runner）、模拟玩家（Simulator）、录制回放（Recorder/Replayer）、质量断言（Inspector）、A/B 测试和 Flow 编辑器核心逻辑等能力。

**核心特点**：
- **纯逻辑层**：所有模块都是纯 TypeScript 实现，不包含 UI
- **MCP 集成**：通过 MCP Server 暴露能力，供 UI 和其他工具使用
- **框架无关**：editor 模块提供核心逻辑，UI 层由独立项目实现
- **完善的错误处理**：每个模块都有详细的错误类型和处理
- **异步优先**：所有 I/O 操作使用 async/await

依赖：`@kal-ai/core`（Model、StateManager、Flow）。


### 会议共识（2026-02-24）

- Simulator 本质是一个 agent 循环，模拟人的行为来自动化测试
- Simulator 可以跑十几二十个版本，晚上自动跑，第二天检查结果
- Recorder/Replayer 和 Simulator 属于整体测试工具的一部分
- A/B Prompt 测试和 A/B Model 测试可以在 Simulator 的 agent 循环中运行
- Inspector 用于打断言，检查生成内容的质量分布
- **Editor 模块只提供核心逻辑（无 UI）**，UI 层由 KAL-AI UI 项目实现
- **devkit 通过 MCP Server 暴露能力**，供 UI 的 Agent 调用
- 振华（zhliu）负责 agent 和开发者工具开发，后期打主力

### 设计原则

1. **异步优先**：所有 I/O 操作使用 async/await
2. **完善的错误处理**：每个模块都有详细的错误类型和处理
3. **事件驱动**：使用 EventEmitter 实现松耦合
4. **类型安全**：完整的 TypeScript 类型定义，运行时类型检查
5. **性能优化**：支持批量操作、并行执行
6. **可测试性**：纯函数设计，易于单元测试和集成测试

## 一、模块划分

| 模块 | 职责 | 对外暴露 | UI 层 |
|------|------|----------|-------|
| `runner` | Flow/KalCore 运行器，命令行执行入口 | FlowRunner | 无 UI |
| `simulator` | 模拟玩家 agent，自动化测试循环 | Simulator, PlayerAgent | 无 UI |
| `recorder` | 录制游戏会话（状态快照 + 事件流） | Recorder | 无 UI |
| `replayer` | 回放录制的会话，支持断点 | Replayer | 无 UI |
| `inspector` | 质量断言引擎，检查 AI 输出 | Inspector, Assertion | 无 UI |
| `ab-test` | A/B Prompt 和 A/B Model 对比测试 | ABTestRunner | 无 UI |
| `editor` | Flow 编辑器核心逻辑（无 UI） | EditorState, FlowEditor | **UI 由 KAL-AI UI 实现** |

**MCP Server 封装**（独立项目 `devkit-mcp-server`）：
- 将 devkit 所有能力封装为 MCP Tools
- 通过 stdio 或 SSE 传输暴露给 UI Agent
- 详见本文档第十二章和 `ui-dev-guide.md` 附录 A

**关键说明**：
- 所有模块都是纯逻辑层，不包含任何 UI 代码
- `editor` 模块提供状态管理、操作接口、校验逻辑，但不涉及渲染
- UI 层（React Flow、Monaco Editor 等）由 KAL-AI UI 项目实现
- **MCP Server 是推荐的集成方式**：
  - 独立项目 `devkit-mcp-server` 封装所有 devkit 能力
  - 通过 MCP 协议暴露给 UI Agent
  - 支持 stdio（本地）和 SSE（远程）两种传输方式
  - 详见第十二章"MCP Server 开发指南"
- **异步处理**：所有 I/O 操作使用 async/await
- **错误处理**：完善的错误类型和 try-catch
- **事件驱动**：使用 EventEmitter 实现松耦合

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
│   │   ├── errors.ts          # 错误类型定义
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
│   ├── ab-test/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   └── ab-test-runner.ts
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

packages/devkit-mcp-server/ (独立项目，
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

## 三、核心接口定义

### 3.0 错误类型

```typescript
// types/errors.ts
import { KalError } from '@kal-ai/core'

/**
 * 模拟错误 - 在模拟过程中发生的错误
 *
 */
export class SimulationError extends KalError {
  constructor(message: string, readonly round: number, cause?: unknown) {
    super(message, 'SIMULATION_ERROR', cause)
    this.name = 'SimulationError'
  }
}

/**
 * 断言错误 - 断言函数执行出错（不是断言失败）
 *
 */
export class AssertionError extends KalError {
  constructor(message: string, readonly assertionId: string, cause?: unknown) {
    super(message, 'ASSERTION_ERROR', cause)
    this.name = 'AssertionError'
  }
}

/**
 * 录制错误 - 录制过程中的错误
 */
export class RecordingError extends KalError {
  constructor(message: string, readonly frameIndex: number, cause?: unknown) {
    super(message, 'RECORDING_ERROR', cause)
    this.name = 'RecordingError'
  }
}

/**
 * 回放错误 - 回放过程中的错误
 */
export class ReplayError extends KalError {
  constructor(message: string, readonly frameIndex: number, cause?: unknown) {
    super(message, 'REPLAY_ERROR', cause)
    this.name = 'ReplayError'
  }
}

/**
 * 编辑器错误 - Flow 编辑操作错误
 */
export class EditorError extends KalError {
  constructor(message: string, readonly operation: string, cause?: unknown) {
    super(message, 'EDITOR_ERROR', cause)
    this.name = 'EditorError'
  }
}
```

> **错误处理原则**：
> - 所有 devkit 错误继承自 core 的 `KalError`，可统一用 `instanceof KalError` 捕获
> - `SimulationError` 在 `roundTimeoutMs` 超时时抛出（`exitReason: 'timeout'`）
> - 断言失败不抛出异常，结果记录在 `AssertionResult.passed` 中
> - 只有断言函数本身执行出错时才抛 `AssertionError`
> - 每个错误都包含详细的上下文信息（round、frameIndex、operation 等）
> - 支持错误链（cause 参数），便于追踪根本原因
> - 所有异步操作都应该用 try-catch 包裹

### 3.1 runner — Flow 运行器

```typescript
// runner/interfaces.ts

import type { KalCore } from '@kal-ai/core'
import type { FlowDefinition, FlowResult, FlowExecutor } from '@kal-ai/core/flow'

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
  readonly onEvent?: (event: import('@kal-ai/core/flow').FlowEvent) => void
  /** 超时时间（ms），
  readonly timeout?: number
  /** 错误处理策略 */
  readonly onError?: (error: Error) => void | Promise<void>
}

/** Flow 运行器 — 一键加载并执行 Flow */
export interface FlowRunner {
  /** 加载 Flow（从文件路径或对象） */
  load(options: FlowRunnerOptions): Promise<FlowExecutor>

  /** 加载并立即执行，返回最终结果 */
  run(options: FlowRunnerOptions): Promise<FlowRunResult>

  /** 取消正在运行的 Flow */
  abort(): void
}

export interface FlowRunResult {
  readonly flowResult: FlowResult
  readonly duration: number
  readonly summary?: string
  /** Token 用量统计 */
  readonly usage?: import('@kal-ai/core').TokenUsage
}
```

**实现要点**：
- ✅ 支持超时控制（默认 2 分钟，最大 10 分钟）
- ✅ 支持中断执行（abort）
- ✅ 完善的错误处理（try-catch + 错误回调）
- ✅ 事件回调（实时反馈执行进度）
- ✅ Token 用量统计

### 3.2 simulator — 模拟玩家

```typescript
// simulator/interfaces.ts

import type { KalCore, ModelConfig } from '@kal-ai/core'
import type { FlowDefinition, FlowExecutor } from '@kal-ai/core/flow'

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
  /** 最大重试次数 */
  readonly maxRetries?: number
  /** 超时时间（ms） */
  readonly timeout?: number
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
  /** 单回合超时（ms），
  readonly roundTimeoutMs?: number
  /** 是否录制（自动启用 Recorder） */
  readonly record?: boolean
  /** 回合回调 */
  readonly onRound?: (event: SimulationRoundEvent) => void
  /** 断言列表（每回合结束后检查，所有回合完成后汇总到 SimulationResult.assertionResults） */
  readonly assertions?: readonly import('../inspector/interfaces').Assertion[]
  /** 错误处理回调 */
  readonly onError?: (error: Error, round: number) => void | Promise<void>
}

export interface SimulationRoundEvent {
  readonly round: number
  readonly action: PlayerAction
  readonly stateAfter: Readonly<Record<string, unknown>>
  readonly nodeResults: Readonly<Record<string, unknown>>
  readonly duration: number
  /** Token 用量 */
  readonly usage?: import('@kal-ai/core').TokenUsage
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
  readonly failedFlowResult?: import('@kal-ai/core/flow').FlowResult
}

/** 模拟器 — 运行自动化测试循环 */
export interface Simulator {
  /** 运行单次模拟 */
  run(config: SimulationConfig): Promise<SimulationResult>

  /** 批量运行（多个配置并行），
  runBatch(configs: readonly SimulationConfig[]): Promise<readonly SimulationResult[]>

  /** 取消正在运行的模拟 */
  abort(): void
}
```

**实现要点**：
- ✅ 异步处理（所有操作都是 async）
- ✅ 超时控制（单回合超时、总超时）
- ✅ 错误处理（try-catch + 错误回调）
- ✅ 中断支持（abort）
- ✅ 并行执行（runBatch 使用 Promise.all）
- ✅ 事件回调（实时反馈进度）
- ✅ Token 用量统计

### 3.3 recorder — 录制

```typescript
// recorder/interfaces.ts

import type { StateChangeEvent } from '@kal-ai/core'
import type { FlowEvent } from '@kal-ai/core/flow'

/** 录制帧 — 一个时间点的快照 */
export interface RecordingFrame {
  readonly timestamp: number
  readonly round: number
  readonly stateSnapshot: Readonly<Record<string, unknown>>
  readonly stateChanges: readonly StateChangeEvent[]
  readonly flowEvents: readonly FlowEvent[]
  readonly playerAction?: import('../simulator/interfaces').PlayerAction
  readonly nodeOutputs: Readonly<Record<string, unknown>>
  /** Token 用量 */
  readonly usage?: import('@kal-ai/core').TokenUsage
}

/** 完整录制 */
export interface Recording {
  readonly id: string
  readonly flowId: string
  readonly startedAt: number
  readonly completedAt?: number
  readonly frames: readonly RecordingFrame[]
  readonly metadata?: Readonly<Record<string, unknown>>
  /** 总 Token 用量 */
  readonly totalUsage?: import('@kal-ai/core').TokenUsage
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

  /** 订阅帧捕获事件 */
  onCapture(listener: (frame: RecordingFrame) => void): () => void
}
```

**实现要点**：
- ✅ 事件驱动（onCapture 订阅）
- ✅ 自动时间戳（Date.now()）
- ✅ JSON 序列化/反序列化
- ✅ 元数据支持
- ✅ Token 用量统计
- ✅ 错误处理（录制失败不影响主流程）

### 3.4 replayer — 回放

```typescript
// replayer/interfaces.ts

import type { Recording, RecordingFrame } from '../recorder/interfaces'

/**
 * 回放速度：
 * - 数字倍速（0.5/1/2/4）：按帧间时间戳差值缩放，onFrame 回调按比例延迟触发
 * - 'instant'：忽略时间戳，同步遍历所有帧，onFrame 回调逐帧同步触发，play() 立即 resolve
 *
 *
 */
export type ReplaySpeed = 0.5 | 1 | 2 | 4 | 'instant'

export interface ReplayerOptions {
  readonly recording: Recording
  readonly speed?: ReplaySpeed
  readonly onFrame?: (frame: RecordingFrame, index: number) => void
  readonly onComplete?: () => void
  /** 错误处理 */
  readonly onError?: (error: Error, frameIndex: number) => void
}

/** 回放器 */
export interface Replayer {
  /** 加载录制 */
  load(recording: Recording): void

  /** 开始回放（支持流式播放） */
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

  /** 订阅播放状态变化 */
  onStateChange(listener: (playing: boolean) => void): () => void
}
```

**实现要点**：
- ✅ 流式播放（按时间戳延迟触发）
- ✅ 速度控制（0.5x - 4x + instant）
- ✅ 暂停/恢复/跳转
- ✅ 单步调试（前进/后退）
- ✅ 事件订阅（onFrame、onStateChange）
- ✅ 错误处理（播放失败不崩溃）

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

Editor 模块提供与 UI 框架无关的编辑器核心逻辑（纯 TypeScript），**不包含任何 UI 渲染代码**。UI 层（React Flow、Canvas 等）由 KAL-AI UI 项目实现。

> **设计原则**：
> - editor 模块只管数据操作（节点增删改、端口连线、撤销重做、校验、布局计算）
> - 不包含任何 UI 交互状态（selected、dragging、highlighted、pendingConnection 等留在 UI 层）
> - 不涉及任何 DOM/Canvas 渲染、React 组件、CSS 样式
> - 编辑器采用端口-中心数据流模型，连线在端口之间建立，而非节点之间
> - **通过 MCP Server 暴露给 UI Agent**，Agent 通过 MCP 工具操作 Flow

**与 UI 的关系**：
```
UI (React Flow UI)
  ↓ 订阅状态
EditorState (devkit/editor)          ← 纯数据状态，无 UI 交互状态
  ↑ 调用操作
FlowEditor API (devkit/editor)
  ↑ MCP 工具调用
MCP Server (devkit-mcp-server)
  ↑ MCP 协议
UI Agent (@kal-ai/core)
```

```typescript
// editor/interfaces.ts

import type {
  FlowJson, FlowNodeJson, FlowGraphValidation,
  PortDataType, PortCompatibility,
  NodeTypeRegistry, NodeTypeDefinition,
  NodeCategory,
} from '@kal-ai/core/flow'

/** 编辑器中的端口（解析后的端口信息） */
export interface EditorPort {
  readonly name: string
  readonly type: PortDataType
  readonly direction: 'input' | 'output'
  readonly description?: string
  readonly required?: boolean
  /** 是否已连接 */
  readonly connected: boolean
}

/** 编辑器中的节点（FlowNodeJson + 解析后的端口和类型元信息） */
export interface EditorNode extends FlowNodeJson {
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
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** 校验结果，每次操作后自动更新 */
  readonly validation: FlowGraphValidation
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
  /** 检查两个端口是否可连接 */
  canConnect(fromNode: string, fromPort: string, toNode: string, toPort: string): PortCompatibility

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

  // ---- 节点类型查询 ----
  /** 获取可用节点类型列表 */
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

Editor 与 flow 的关系：
- 读写同一份 `FlowJson` 格式，`FlowNodeJson.ui` 字段存储节点位置等 UI 元数据
- 通过 `NodeTypeRegistry` 获取节点的端口定义、可编辑参数、分类等元信息
- 连线操作基于端口类型校验（`checkPortCompatibility`），不兼容的端口无法连接
- 校验复用 flow 的 `FlowGraph.validate()`（环检测、写冲突检测、端口类型校验）
- 运行时 executor 忽略 `ui` 字段，编辑器忽略 `handler` 的实际函数绑定

Editor 与 UI 的关系：
- **devkit 提供核心逻辑**：FlowEditor 管理 Flow 数据和操作，不含 UI 交互状态
- **UI 层自行管理交互状态**：selected、dragging、highlighted、pendingConnection 等由 UI 层维护
- **通过 MCP 连接**：UI Agent 通过 MCP 工具调用 FlowEditor
- **状态同步**：FlowEditor 状态变化 → MCP 事件 → KAL-AI UI 更新

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
│  recorder ── 依赖 types + core(State) + flow(FlowEvent) │
│  replayer ── 依赖 types + recorder               │
│  inspector ── 依赖 types                          │
│  runner ── 依赖 types + core/flow              │
│  simulator ── 依赖 types + core/flow + recorder + inspector │
│  ab-test ── 依赖 types + simulator + inspector    │
│  editor ── 依赖 types + flow(FlowJson, FlowGraph) │
│                                                  │
│  对外：createSimulator() / createABTestRunner()   │
│        createFlowEditor() (纯逻辑，无 UI)         │
└──────────────────────────────────────────────────┘
                    ↕ 直接调用或通过 MCP
┌──────────────────────────────────────────────────┐
│         devkit-mcp-server (独立项目)              │
│                                                  │
│  MCP Server Core                                 │
│  ├── Tool Registry (工具注册)                    │
│  ├── Event Emitter (事件通知)                    │
│  └── Connection Manager (连接管理)               │
│                                                  │
│  Services (封装 devkit 模块)                      │
│  ├── FlowEditorService → FlowEditor              │
│  ├── SimulatorService → Simulator                │
│  ├── ReplayerService → Replayer                  │
│  ├── InspectorService → Inspector                │
│  └── ProjectService (文件系统操作)                │
│                                                  │
│  MCP Tools (暴露给 UI Agent)                    │
│  ├── create_flow, add_node, connect_nodes...    │
│  ├── run_simulation, replay_recording...        │
│  └── list_flows, read_file, write_file...       │
└──────────────────────────────────────────────────┘
                    ↕ MCP Protocol (stdio/SSE)
┌──────────────────────────────────────────────────┐
│              KAL-AI UI (React)                  │
│                                                  │
│  Agent (@kal-ai/core) + MCP Client               │
│  └── 调用 MCP Tools 操作 Flow                    │
│                                                  │
│  UI Layer (React Flow, Monaco Editor)           │
│  └── 订阅 MCP 事件，实时更新显示                  │
└──────────────────────────────────────────────────┘
```

核心依赖链：`recorder → simulator → ab-test`，inspector 是独立的断言引擎，被 simulator 和 ab-test 消费。

**MCP 集成架构**：
- **devkit 包**：纯逻辑层，可直接调用或通过 MCP 暴露
- **devkit-mcp-server 包**：独立项目，封装 devkit 为 MCP Server
  - 支持 stdio 传输（本地进程通信，）
  - 支持 SSE 传输（远程 HTTP 通信，）
  - 提供 30+ MCP Tools
  - 实现事件通知机制
- **UI Agent**：通过 MCP Client 调用工具，驱动 Flow 开发
- 详见第十二章"MCP Server 开发指南"和 `ui-dev-guide.md` 附录 A

**设计原则**：
- ✅ **异步处理**：所有 I/O 操作使用 async/await
- ✅ **错误处理**：每个模块都有完善的 try-catch
- ✅ **事件驱动**：使用 EventEmitter 实现松耦合
- ✅ **并行执行**：支持批量操作和 Promise.all
- ✅ **类型安全**：完整的 TypeScript 类型定义
- ✅ **可测试性**：纯函数设计，易于单元测试

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
    core,
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
  // 错误处理
  onError: (error, round) => {
    console.error(`模拟 ${i} 在回合 ${round} 失败:`, error.message)
  },
  // 实时反馈
  onRound: (event) => {
    console.log(`模拟 ${i} - 回合 ${event.round}: Token ${event.usage?.totalTokens}`)
  }
}))

// 并行执行
const results = await simulator.runBatch(configs)

// 检查结果
for (const [i, result] of results.entries()) {
  const failed = result.assertionResults?.filter(r => !r.passed) ?? []
  if (failed.length > 0) {
    console.log(`模拟 ${i}: ${result.totalRounds} 回合，${failed.length} 个断言失败:`)
    failed.forEach(f => console.log(`  - ${f.message}`))
  }

  // Token 用量统计
  console.log(`模拟 ${i}: 总 Token ${result.usage.totalTokens}`)
}
```

**关键点**：
- ✅ 并行执行（Promise.all）
- ✅ 错误处理（onError 回调）
- ✅ 实时反馈（onRound 回调）
- ✅ Token 用量统计
- ✅ 断言检查

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
| 1A | runner — Flow 运行器 | core/flow 可用 |
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
| 3C | editor — 编辑器核心逻辑（状态管理、撤销重做） | flow(FlowJson, FlowGraph) |
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

devkit 主要由振华（zhliu）主导开发，依赖 core/flow 的接口稳定后启动。建议：
- Phase 0 与 core/flow 的 Phase 0 同步进行（只写类型）
- Phase 1 在 core Phase 2（Model 可用）后启动
- Phase 2-3 在 flow Phase 2（FlowExecutor 可用）后启动
- **Editor 模块（3C/3D）**：
  - 振华负责核心逻辑实现（纯 TypeScript，无 UI）
  - editor 只依赖 flow 的类型定义，不依赖 FlowExecutor 实现
  - 可以更早启动，与 simulator 路径并行
  - **UI 层由 KAL-AI UI 项目实现**，不在 devkit 范围内

### MCP Server 开发（推荐）

**Phase 5：MCP Server 封装（5 天）**

MCP Server 是 devkit 与 UI 集成的推荐方式：

| 任务 | 内容 | 参考 |
|------|------|------|
| 5A | MCP Server 基础架构（2 天） || 5B | FlowEditor Service + Tools（1 天） || 5C | Simulator/Replayer Service + Tools（1 天） || 5D | 事件通知 + 性能优化（1 天） |
详见第十二章"MCP Server 开发指南"

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

describe('Inspector', () => {
  it('should pass state range assertion', () => {
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
  })

  // 错误处理测试
  it('should handle assertion errors gracefully', () => {
    const inspector = createInspector()
    inspector.add({
      id: 'test',
      name: 'Test',
      kind: 'custom',
      check: () => {
        throw new Error('Assertion function failed')
      }
    })

    const ctx: AssertionContext = { /* ... */ }

    // 断言函数执行出错应该抛出 AssertionError
    expect(() => inspector.check(ctx)).toThrow(AssertionError)
  })
})
```

**Simulator 集成测试（mock 模型）**

```typescript
// 用 ScriptedStrategy 避免真实 LLM 调用，确定性可重复
describe('Simulator', () => {
  it('should complete simulation with scripted strategy', async () => {
    const simulator = createSimulator()

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
    expect(result.totalRounds).toBe(2)
  })

  // 超时测试
  it('should timeout on slow rounds', async () => {
    const simulator = createSimulator()

    const result = await simulator.run({
      core,
      flow: slowFlowDef,
      strategy: createRandomStrategy(),
      maxRounds: 10,
      roundTimeoutMs: 1000, // 1 秒超时
    })

    expect(result.exitReason).toBe('timeout')
  })

  // 错误处理测试
  it('should handle flow failures', async () => {
    const simulator = createSimulator()
    const errors: Error[] = []

    const result = await simulator.run({
      core,
      flow: failingFlowDef,
      strategy: createRandomStrategy(),
      maxRounds: 5,
      onError: (error, round) => {
        errors.push(error)
      }
    })

    expect(result.exitReason).toBe('flow_failed')
    expect(errors.length).toBeGreaterThan(0)
  })

  // 并行执行测试
  it('should run batch simulations in parallel', async () => {
    const simulator = createSimulator()
    const configs = Array.from({ length: 5 }, () => ({
      core,
      flow: myFlowDef,
      strategy: createRandomStrategy(),
      maxRounds: 3,
    }))

    const startTime = Date.now()
    const results = await simulator.runBatch(configs)
    const duration = Date.now() - startTime

    expect(results.length).toBe(5)
    // 并行执行应该比顺序执行快
    expect(duration).toBeLessThan(5000)
  })
})
```

**Editor 往返一致性测试**

```typescript
// FlowJson 序列化/反序列化后内容不变
describe('FlowEditor', () => {
  it('should preserve flow structure after round-trip', () => {
    const editor = createFlowEditor()
    editor.load(originalFlowJson)
    editor.addNodeByType('ai.narrative', { x: 100, y: 100 })
    const exported = editor.toJson()

    // 重新加载，验证节点数量一致
    const editor2 = createFlowEditor()
    editor2.load(exported)
    expect(editor2.getState().nodes.length).toBe(editor.getState().nodes.length)
  })

  // 撤销重做测试
  it('should support undo/redo', () => {
    const editor = createFlowEditor()
    editor.load(emptyFlow)

    const nodeId = editor.addNodeByType('ai.narrative', { x: 100, y: 100 })
    expect(editor.getState().nodes.length).toBe(1)
    expect(editor.getState().canUndo).toBe(true)

    editor.undo()
    expect(editor.getState().nodes.length).toBe(0)
    expect(editor.getState().canRedo).toBe(true)

    editor.redo()
    expect(editor.getState().nodes.length).toBe(1)
  })

  // 错误处理测试
  it('should handle invalid operations gracefully', () => {
    const editor = createFlowEditor()
    editor.load(emptyFlow)

    // 连接不存在的节点应该抛出错误
    expect(() => {
      editor.connect('non-existent-1', 'output', 'non-existent-2', 'input')
    }).toThrow(EditorError)
  })
})
```

**性能测试**

```typescript
describe('Performance', () => {
  it('should handle large simulations efficiently', async () => {
    const simulator = createSimulator()

    const startTime = Date.now()
    const result = await simulator.run({
      core,
      flow: complexFlowDef,
      strategy: createRandomStrategy(),
      maxRounds: 100,
      record: true,
    })
    const duration = Date.now() - startTime

    expect(result.totalRounds).toBe(100)
    expect(duration).toBeLessThan(60000) // 应该在 1 分钟内完成
  })

  it('should handle large recordings efficiently', () => {
    const recorder = createRecorder()
    recorder.start('perf-test')

    // 录制 1000 帧
    for (let i = 0; i < 1000; i++) {
      recorder.capture({
        round: i,
        stateSnapshot: { frame: i },
        stateChanges: [],
        flowEvents: [],
        nodeOutputs: {},
      })
    }

    const recording = recorder.stop()
    expect(recording.frames.length).toBe(1000)

    // 导出和导入应该很快
    const startTime = Date.now()
    const json = recorder.export(recording)
    const imported = recorder.import(json)
    const duration = Date.now() - startTime

    expect(imported.frames.length).toBe(1000)
    expect(duration).toBeLessThan(1000) // 应该在 1 秒内完成
  })
})
```

**错误恢复测试**

```typescript
describe('Error Recovery', () => {
  it('should recover from transient errors', async () => {
    const simulator = createSimulator()
    let failCount = 0

    const result = await simulator.run({
      core,
      flow: myFlowDef,
      strategy: {
        name: 'flaky-strategy',
        decide: async (ctx) => {
          // 前 3 次失败，第 4 次成功
          if (failCount < 3) {
            failCount++
            throw new Error('Transient error')
          }
          return { type: 'choice', payload: { actionId: 'continue' }, timestamp: Date.now() }
        }
      },
      maxRounds: 5,
      onError: (error, round) => {
        console.log(`Round ${round} failed, retrying...`)
      }
    })

    expect(result.exitReason).toBe('completed')
    expect(failCount).toBe(3)
  })
})
```

## 九、与 UI 的集成

### 9.1 核心关系

```
┌─────────────────────────────────────────────────┐
│                  KAL-AI UI                      │
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

**UI 项目负责**：
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
2. UI Agent 理解意图
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
8. UI MCP Client 接收事件
   ↓
9. UI 更新本地状态
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
3. UI 调用 MCP 工具：update_node({ nodeId, position })
   ↓
4. MCP Server 调用 FlowEditor.moveNode()
   ↓
5. FlowEditor 更新状态
   ↓
6. MCP Server 发送事件：flow:node:updated
   ↓
7. UI 确认同步完成
```

### 9.4 状态同步策略

**单向数据流**：
- FlowEditor 是唯一的 Source of Truth
- UI 的状态是 FlowEditor 状态的镜像
- 所有修改都通过 MCP 工具同步到 FlowEditor

**乐观更新**：
- UI 可以先更新本地 UI（乐观更新）
- 然后调用 MCP 工具同步
- 如果 MCP 调用失败，回滚本地状态

**事件驱动**：
- MCP Server 在操作完成后发送事件
- UI 订阅事件并更新 UI
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

**方式 2：通过 MCP（推荐用于 UI）**

适用于 UI、远程工具、多用户场景：

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

// UI 端
const result = await mcpClient.callTool('add_node', {
  nodeType: 'ai.narrative',
  position: { x: 100, y: 100 }
})
```

### 9.6 Editor 状态订阅

UI 可以订阅 FlowEditor 的状态变化（如果直接使用）：

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

但在 MCP 模式下，UI 通过 MCP 事件获取状态变化，不直接订阅 FlowEditor。

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
- ✅ 使用 try-catch 包裹所有操作
- ✅ 提供详细的错误信息

**DON'T**：
- ❌ 不要直接修改 `EditorState`（只读）
- ❌ 不要绕过 FlowEditor API 直接修改 FlowJson
- ❌ 不要在 devkit 中写 UI 代码
- ❌ 不要假设 UI 框架（React/Vue/Angular）
- ❌ 不要忽略错误处理
- ❌ 不要阻塞事件循环（使用异步操作）

### 10.2 MCP Server 开发建议

**DO**：
- ✅ 每个操作完成后发送事件通知
- ✅ 返回详细的错误信息
- ✅ 支持批量操作减少调用次数
- ✅ 实现状态持久化
- ✅ 提供健康检查接口
- ✅ 使用 try-catch 包裹所有工具调用
- ✅ 实现自动重连机制
- ✅ 记录性能指标（工具执行时间、内存占用）

**DON'T**：
- ❌ 不要在 MCP Server 中实现业务逻辑（应在 devkit 中）
- ❌ 不要阻塞事件循环（使用异步操作）
- ❌ 不要忽略错误处理
- ❌ 不要在事件中发送大量数据（使用增量更新）
- ❌ 不要假设 MCP Client 总是可用
- ❌ 不要频繁调用工具（合并操作）

### 10.3 UI 集成建议

**DO**：
- ✅ 使用乐观更新提升响应速度
- ✅ 订阅 MCP 事件并更新 UI
- ✅ 缓存 FlowEditor 状态减少 MCP 调用
- ✅ 使用动画展示状态变化
- ✅ 提供离线模式（本地 FlowEditor）
- ✅ 实现错误恢复机制
- ✅ 显示 Token 用量统计

**DON'T**：
- ❌ 不要频繁调用 MCP 工具（合并操作）
- ❌ 不要忽略 MCP 连接状态
- ❌ 不要在 UI 层实现 Flow 校验逻辑（应调用 MCP）
- ❌ 不要假设 MCP Server 总是可用
- ❌ 不要阻塞 UI 线程（使用 Web Worker）

### 10.4 异步处理建议

**DO**：
- ✅ 所有 I/O 操作使用 async/await
- ✅ 使用 Promise.all 并行执行独立操作
- ✅ 使用 Promise.race 实现超时控制
- ✅ 使用 try-catch 包裹所有异步操作
- ✅ 提供取消机制（abort）
- ✅ 实现重试机制（指数退避）

**DON'T**：
- ❌ 不要使用回调函数（使用 Promise）
- ❌ 不要忘记 await（会导致未捕获的 Promise rejection）
- ❌ 不要在循环中串行执行（使用 Promise.all）
- ❌ 不要忽略错误处理
- ❌ 不要无限重试（设置最大重试次数）

### 10.5 错误处理建议

**DO**：
- ✅ 使用自定义错误类型（SimulationError、AssertionError 等）
- ✅ 提供详细的错误信息（包含上下文）
- ✅ 支持错误链（cause 参数）
- ✅ 记录错误日志
- ✅ 提供错误恢复机制
- ✅ 区分可恢复错误和不可恢复错误

**DON'T**：
- ❌ 不要吞掉错误（至少记录日志）
- ❌ 不要抛出字符串（使用 Error 对象）
- ❌ 不要忽略错误上下文
- ❌ 不要在错误处理中再次抛出错误（除非必要）

### 10.6 性能优化建议

**DO**：
- ✅ 使用批量操作减少调用次数
- ✅ 使用 Promise.all 并行执行
- ✅ 使用缓存减少重复计算
- ✅ 使用增量更新减少数据传输
- ✅ 使用连接池管理连接
- ✅ 记录性能指标（执行时间、内存占用）
- ✅ 使用 Prompt Caching 减少 Token 消耗

**DON'T**：
- ❌ 不要在循环中进行 I/O 操作（批量处理）
- ❌ 不要重复计算（使用缓存）
- ❌ 不要传输大量数据（使用增量更新）
- ❌ 不要阻塞事件循环（使用异步操作）
- ❌ 不要忽略性能监控

### 10.7 测试建议

**DO**：
- ✅ 编写单元测试（纯函数、独立模块）
- ✅ 编写集成测试（模块间交互）
- ✅ 编写端到端测试（完整流程）
- ✅ 使用 mock 避免真实 API 调用
- ✅ 测试错误处理（异常情况）
- ✅ 测试性能（大数据量、并发）
- ✅ 测试边界条件（空输入、极端值）

**DON'T**：
- ❌ 不要依赖外部服务（使用 mock）
- ❌ 不要忽略错误测试
- ❌ 不要忽略性能测试
- ❌ 不要写脆弱的测试（依赖执行顺序）

## 十一、扩展阅读

### 11.1 相关文档

- [UI 开发文档](./ui-dev-guide.md) - UI 架构和 MCP 集成
- [Core 开发文档](./core-dev-guide.md) - Model、Tools、State 等核心能力
- [Flow 开发文档](./flow-dev-guide.md) - Flow 执行引擎

### 11.2 MCP 协议

- [MCP 官方文档](https://modelcontextprotocol.io/docs)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- MCP Server 开发指南见第十二章


**Editor 基础使用**：

```typescript
import { createFlowEditor } from '@kal-ai/devkit'
import { createNodeTypeRegistry } from '@kal-ai/core/flow'

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

**Q: 如何在 UI 中渲染 Flow？**

A: UI 使用 React Flow 等 UI 库渲染。从 MCP 获取 EditorState，转换为 React Flow 的 nodes 和 edges 格式，然后渲染。详见 `ui-dev-guide.md`。

**Q: Editor 支持协作编辑吗？**

A: Editor 本身不支持，但可以通过 MCP Server 实现。多个 UI 连接同一个 MCP Server，通过事件通知同步状态。

**Q: 如何扩展自定义节点类型？**

A: 在 `@kal-ai/core/flow` 的 NodeTypeRegistry 中注册自定义节点类型。Editor 会自动识别并支持。

**Q: Simulator 可以并行运行吗？**

A: 可以。使用 `simulator.runBatch()` 并行运行多个模拟。每个模拟使用独立的 KalCore 实例。

**Q: 如何调试 Flow 执行？**

A: 使用 Recorder 录制执行过程，然后用 Replayer 回放。可以单步执行、查看每帧的状态和节点输出。

## 十二、MCP Server 开发指南

### 12.1 为什么需要 MCP Server

**优势**：

1. **解耦**：devkit 和 UI 独立开发、独立部署
   - 工具更新不影响主程序

2. **标准化**：MCP 是标准协议，未来可以接入其他工具
   - 社区可以贡献新的 MCP 服务器

3. **灵活性**：MCP Server 可以本地运行或远程部署
   - stdio 传输：本地进程通信
   - SSE 传输：远程 HTTP 通信

4. **可扩展**：容易添加新工具，不需要修改 UI 代码
   - 无需重新编译或部署

5. **安全性**：MCP Server 可以做权限控制和沙箱隔离
   - 用户可以控制工具访问范围

### 12.2 MCP Server 架构

```
devkit-mcp-server (独立项目)
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

**核心组件**：

```typescript
// server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createFlowEditor, createSimulator, createReplayer } from '@kal-ai/devkit'

class DevkitMCPServer {
  private server: Server
  private flowEditor: FlowEditor
  private simulator: Simulator
  private replayer: Replayer

  constructor() {
    this.server = new Server(
      { name: 'kal-devkit', version: '1.0.0' },
      { capabilities: { tools: {} } }
    )

    // 初始化 devkit 模块
    this.flowEditor = createFlowEditor()
    this.simulator = createSimulator()
    this.replayer = createReplayer()

    // 注册工具
    this.registerTools()
  }

  private registerTools() {
    // Flow 编辑工具
    this.server.setRequestHandler('tools/list', async () => ({
      tools: [
        {
          name: 'create_flow',
          description: '创建新 Flow',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Flow 名称' },
              description: { type: 'string', description: 'Flow 描述' }
            },
            required: ['name']
          }
        },
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
                enum: ['ai.narrative', 'ai.dialogue', 'logic.branch', 'state.read', 'state.write']
              },
              name: { type: 'string', description: '节点名称' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              }
            },
            required: ['flowId', 'nodeType', 'name']
          }
        },
        // ... 更多工具
      ]
    }))

    // 工具调用处理
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'create_flow':
            return await this.handleCreateFlow(args)
          case 'add_node':
            return await this.handleAddNode(args)
          // ... 更多工具处理
          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.name,
                message: error.message
              }
            })
          }],
          isError: true
        }
      }
    })
  }

  private async handleCreateFlow(args: any) {
    const flow = {
      id: crypto.randomUUID(),
      name: args.name,
      description: args.description,
      nodes: [],
      edges: []
    }

    this.flowEditor.load(flow)

    // 发送事件通知
    await this.server.notification({
      method: 'notifications/event',
      params: {
        type: 'flow:created',
        data: { flowId: flow.id }
      }
    })

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          flowId: flow.id
        })
      }]
    }
  }

  private async handleAddNode(args: any) {
    const nodeId = this.flowEditor.addNodeByType(
      args.nodeType,
      args.position || { x: 0, y: 0 }
    )

    // 发送事件通知
    await this.server.notification({
      method: 'notifications/event',
      params: {
        type: 'flow:node:added',
        data: {
          flowId: args.flowId,
          nodeId,
          nodeType: args.nodeType,
          position: args.position
        }
      }
    })

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          nodeId
        })
      }]
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Kal devkit MCP server running on stdio')
  }
}

// 启动服务器
const server = new DevkitMCPServer()
server.run().catch(console.error)
```

### 12.3 MCP 工具定义

**完整的工具列表**：

#### Flow 编辑工具（7 个）

```typescript
// tools/flow-tools.ts
export const flowTools = [
  {
    name: 'create_flow',
    description: '创建新 Flow',
    inputSchema: { /* ... */ }
  },
  {
    name: 'add_node',
    description: '向 Flow 中添加节点。支持所有节点类型。',
    inputSchema: { /* ... */ }
  },
  {
    name: 'connect_nodes',
    description: '连接两个节点的端口',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: { type: 'string' },
        fromNode: { type: 'string' },
        fromPort: { type: 'string' },
        toNode: { type: 'string' },
        toPort: { type: 'string' }
      },
      required: ['flowId', 'fromNode', 'fromPort', 'toNode', 'toPort']
    }
  },
  {
    name: 'update_node',
    description: '更新节点配置',
    inputSchema: { /* ... */ }
  },
  {
    name: 'remove_node',
    description: '删除节点',
    inputSchema: { /* ... */ }
  },
  {
    name: 'auto_layout',
    description: '自动排列节点',
    inputSchema: { /* ... */ }
  },
  {
    name: 'validate_flow',
    description: '校验 Flow（环检测、端口类型检查）',
    inputSchema: { /* ... */ }
  }
]
```

#### 调试与测试工具（5 个）

```typescript
// tools/debug-tools.ts
export const debugTools = [
  {
    name: 'run_simulation',
    description: '运行模拟测试',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: { type: 'string' },
        maxRounds: { type: 'number', description: '最大回合数' },
        playerStrategy: {
          type: 'string',
          enum: ['llm', 'random', 'scripted'],
          description: '玩家策略类型'
        },
        record: { type: 'boolean', description: '是否录制' },
        assertions: {
          type: 'array',
          description: '断言列表',
          items: { type: 'object' }
        }
      },
      required: ['flowId', 'maxRounds']
    }
  },
  {
    name: 'replay_recording',
    description: '回放录制的会话',
    inputSchema: { /* ... */ }
  },
  {
    name: 'inspect_state',
    description: '检查游戏状态',
    inputSchema: { /* ... */ }
  },
  {
    name: 'add_assertion',
    description: '添加质量断言',
    inputSchema: { /* ... */ }
  },
  {
    name: 'analyze_performance',
    description: '性能分析（Token 用量、延迟）',
    inputSchema: { /* ... */ }
  }
]
```

#### 项目管理工具（4 个）

```typescript
// tools/project-tools.ts
export const projectTools = [
  {
    name: 'list_flows',
    description: '列出所有 Flow',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'search_nodes',
    description: '搜索节点',
    inputSchema: { /* ... */ }
  },
  {
    name: 'get_node_types',
    description: '获取可用节点类型列表',
    inputSchema: { /* ... */ }
  },
  {
    name: 'export_flow',
    description: '导出 Flow JSON',
    inputSchema: { /* ... */ }
  }
]
```

### 12.4 事件通知机制

**事件类型**：

```typescript
// 事件定义
type MCPEvent =
  | { type: 'flow:created'; data: { flowId: string } }
  | { type: 'flow:node:added'; data: { flowId: string; nodeId: string; nodeType: string } }
  | { type: 'flow:node:updated'; data: { flowId: string; nodeId: string } }
  | { type: 'flow:node:removed'; data: { flowId: string; nodeId: string } }
  | { type: 'flow:edge:added'; data: { flowId: string; edgeId: string } }
  | { type: 'flow:edge:removed'; data: { flowId: string; edgeId: string } }
  | { type: 'simulation:started'; data: { flowId: string } }
  | { type: 'simulation:round'; data: SimulationRoundEvent }
  | { type: 'simulation:completed'; data: SimulationResult }
  | { type: 'tool:success'; data: { toolName: string; result: any } }
  | { type: 'tool:error'; data: { toolName: string; error: string } }

// 发送事件
class DevkitMCPServer {
  private async sendEvent(event: MCPEvent) {
    await this.server.notification({
      method: 'notifications/event',
      params: event
    })
  }
}
```

### 12.5 Service 设计模式

每个 Service 封装一个 devkit 模块：

```typescript
// services/flow-editor.ts
import { createFlowEditor, type FlowEditor } from '@kal-ai/devkit'
import { EventEmitter } from 'events'

export class FlowEditorService {
  private editor: FlowEditor
  private eventEmitter: EventEmitter
  private stateCache: Map<string, any> = new Map()

  constructor(eventEmitter: EventEmitter) {
    this.editor = createFlowEditor()
    this.eventEmitter = eventEmitter
  }

  async createFlow(args: { name: string; description?: string }) {
    try {
      const flow = {
        id: crypto.randomUUID(),
        name: args.name,
        description: args.description,
        nodes: [],
        edges: []
      }

      this.editor.load(flow)
      this.stateCache.set(flow.id, flow)

      // 发射事件
      this.eventEmitter.emit('flow:created', { flowId: flow.id })

      return { success: true, flowId: flow.id }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'FLOW_CREATION_FAILED',
          message: error.message
        }
      }
    }
  }

  async addNode(args: {
    flowId: string
    nodeType: string
    name: string
    position?: { x: number; y: number }
  }) {
    try {
      // 参数验证
      if (!this.stateCache.has(args.flowId)) {
        throw new Error(`Flow ${args.flowId} not found`)
      }

      // 添加节点
      const nodeId = this.editor.addNodeByType(
        args.nodeType,
        args.position || { x: 0, y: 0 }
      )

      // 更新缓存
      const flow = this.stateCache.get(args.flowId)!
      flow.nodes.push({ id: nodeId, type: args.nodeType, name: args.name })

      // 发射事件
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

  // 批量操作
  async addNodesBatch(args: {
    flowId: string
    nodes: Array<{ nodeType: string; name: string; position?: { x: number; y: number } }>
  }) {
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

### 12.6 错误处理

```typescript
// 完善的错误处理
async function executeMCPTool(toolName: string, args: any) {
  try {
    // 调用工具
    const result = await callTool(toolName, args)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result)
      }]
    }
  } catch (error) {
    // 错误分类处理
    if (error instanceof RateLimitError) {
      // 速率限制 - 等待重试
      await sleep(error.retryAfter)
      return executeMCPTool(toolName, args) // 重试
    }

    if (error instanceof TimeoutError) {
      // 超时 - 返回错误
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: {
              code: 'TIMEOUT',
              message: 'Operation timed out'
            }
          })
        }],
        isError: true
      }
    }

    // 其他错误 - 返回详细错误信息
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: {
            code: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3) // 前3行堆栈
          }
        })
      }],
      isError: true
    }
  }
}
```

### 12.7 性能优化

**批量操作**：

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
            position: { type: 'object' }
          }
        }
      }
    }
  }
}
```

**缓存策略**：

```typescript
// 缓存 Flow JSON
class FlowCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  private ttl = 5 * 60 * 1000 // 5 分钟

  async get(flowId: string) {
    const entry = this.cache.get(flowId)
    if (!entry) return null

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(flowId)
      return null
    }

    return entry.data
  }

  set(flowId: string, data: any) {
    this.cache.set(flowId, {
      data,
      timestamp: Date.now()
    })
  }

  invalidate(flowId: string) {
    this.cache.delete(flowId)
  }
}
```

### 12.8 部署配置

**UI 配置文件**：

```json
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
```

**启动脚本**：

```bash
#!/bin/bash
# start-mcp-server.sh

# 构建 MCP Server
cd devkit-mcp-server
bun run build

# 启动服务器
node dist/index.js
```

### 12.9 测试策略

**单元测试**：

```typescript
describe('FlowEditorService', () => {
  it('should create flow successfully', async () => {
    const service = new FlowEditorService(new EventEmitter())
    const result = await service.createFlow({ name: 'Test Flow' })

    expect(result.success).toBe(true)
    expect(result.flowId).toBeDefined()
  })

  it('should handle errors gracefully', async () => {
    const service = new FlowEditorService(new EventEmitter())
    const result = await service.addNode({
      flowId: 'non-existent',
      nodeType: 'ai.narrative',
      name: 'Test'
    })

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('NODE_ADDITION_FAILED')
  })
})
```

**集成测试**：

```typescript
describe('MCP Server Integration', () => {
  it('should handle tool calls end-to-end', async () => {
    const server = new DevkitMCPServer()

    // 创建 Flow
    const createResult = await server.handleToolCall({
      name: 'create_flow',
      arguments: { name: 'Test Flow' }
    })

    expect(createResult.success).toBe(true)

    // 添加节点
    const addResult = await server.handleToolCall({
      name: 'add_node',
      arguments: {
        flowId: createResult.flowId,
        nodeType: 'ai.narrative',
        name: 'Test Node'
      }
    })

    expect(addResult.success).toBe(true)
  })
})
```

### 12.10 最佳实践

**DO**：
- ✅ 每个操作完成后发送事件通知
- ✅ 返回详细的错误信息
- ✅ 支持批量操作减少调用次数
- ✅ 实现状态持久化
- ✅ 提供健康检查接口
- ✅ 使用 try-catch 包裹所有工具调用
- ✅ 实现自动重连机制
- ✅ 记录性能指标

**DON'T**：
- ❌ 不要在 MCP Server 中实现业务逻辑（应在 devkit 中）
- ❌ 不要阻塞事件循环
- ❌ 不要忽略错误处理
- ❌ 不要在事件中发送大量数据
- ❌ 不要假设 MCP Client 总是可用

### 12.11 示例代码

**完整的 MCP Server 实现**：

```typescript
// devkit-mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  createFlowEditor,
  createSimulator,
  createReplayer,
  createInspector,
  type FlowEditor,
  type Simulator,
  type Replayer,
  type Inspector
} from '@kal-ai/devkit'
import { EventEmitter } from 'events'

class DevkitMCPServer {
  private server: Server
  private flowEditor: FlowEditor
  private simulator: Simulator
  private replayer: Replayer
  private inspector: Inspector
  private eventEmitter: EventEmitter

  constructor() {
    this.server = new Server(
      { name: 'kal-devkit', version: '1.0.0' },
      { capabilities: { tools: {} } }
    )

    // 初始化 devkit 模块
    this.flowEditor = createFlowEditor()
    this.simulator = createSimulator()
    this.replayer = createReplayer()
    this.inspector = createInspector()
    this.eventEmitter = new EventEmitter()

    // 注册工具
    this.registerTools()

    // 订阅事件
    this.subscribeEvents()
  }

  private registerTools() {
    // 列出所有工具
    this.server.setRequestHandler('tools/list', async () => ({
      tools: [
        // Flow 编辑工具
        {
          name: 'create_flow',
          description: '创建新 Flow',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Flow 名称' },
              description: { type: 'string', description: 'Flow 描述' }
            },
            required: ['name']
          }
        },
        {
          name: 'add_node',
          description: '向 Flow 中添加节点',
          inputSchema: {
            type: 'object',
            properties: {
              flowId: { type: 'string' },
              nodeType: { type: 'string' },
              name: { type: 'string' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              }
            },
            required: ['flowId', 'nodeType', 'name']
          }
        },
        {
          name: 'connect_nodes',
          description: '连接两个节点的端口',
          inputSchema: {
            type: 'object',
            properties: {
              flowId: { type: 'string' },
              fromNode: { type: 'string' },
              fromPort: { type: 'string' },
              toNode: { type: 'string' },
              toPort: { type: 'string' }
            },
            required: ['flowId', 'fromNode', 'fromPort', 'toNode', 'toPort']
          }
        },
        // 调试工具
        {
          name: 'run_simulation',
          description: '运行模拟测试',
          inputSchema: {
            type: 'object',
            properties: {
              flowId: { type: 'string' },
              maxRounds: { type: 'number' },
              record: { type: 'boolean' }
            },
            required: ['flowId', 'maxRounds']
          }
        },
        // ... 更多工具
      ]
    }))

    // 处理工具调用
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params

      try {
        let result: any

        switch (name) {
          case 'create_flow':
            result = await this.handleCreateFlow(args)
            break
          case 'add_node':
            result = await this.handleAddNode(args)
            break
          case 'connect_nodes':
            result = await this.handleConnectNodes(args)
            break
          case 'run_simulation':
            result = await this.handleRunSimulation(args)
            break
          default:
            throw new Error(`Unknown tool: ${name}`)
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.name,
                message: error.message
              }
            })
          }],
          isError: true
        }
      }
    })
  }

  private subscribeEvents() {
    // 订阅 devkit 事件并转发给 MCP Client
    this.eventEmitter.on('flow:created', async (data) => {
      await this.sendNotification('flow:created', data)
    })

    this.eventEmitter.on('flow:node:added', async (data) => {
      await this.sendNotification('flow:node:added', data)
    })

    this.eventEmitter.on('simulation:round', async (data) => {
      await this.sendNotification('simulation:round', data)
    })

    // ... 更多事件订阅
  }

  private async sendNotification(type: string, data: any) {
    await this.server.notification({
      method: 'notifications/event',
      params: { type, data }
    })
  }

  private async handleCreateFlow(args: any) {
    const flow = {
      id: crypto.randomUUID(),
      name: args.name,
      description: args.description,
      nodes: [],
      edges: []
    }

    this.flowEditor.load(flow)
    this.eventEmitter.emit('flow:created', { flowId: flow.id })

    return { success: true, flowId: flow.id }
  }

  private async handleAddNode(args: any) {
    const nodeId = this.flowEditor.addNodeByType(
      args.nodeType,
      args.position || { x: 0, y: 0 }
    )

    this.eventEmitter.emit('flow:node:added', {
      flowId: args.flowId,
      nodeId,
      nodeType: args.nodeType
    })

    return { success: true, nodeId }
  }

  private async handleConnectNodes(args: any) {
    const success = this.flowEditor.connect(
      args.fromNode,
      args.fromPort,
      args.toNode,
      args.toPort
    )

    if (success) {
      this.eventEmitter.emit('flow:edge:added', {
        flowId: args.flowId,
        fromNode: args.fromNode,
        fromPort: args.fromPort,
        toNode: args.toNode,
        toPort: args.toPort
      })
    }

    return { success }
  }

  private async handleRunSimulation(args: any) {
    const flow = this.flowEditor.toJson()

    const result = await this.simulator.run({
      core: globalCore, // 需要提供 KalCore 实例
      flow,
      strategy: createRandomStrategy(),
      maxRounds: args.maxRounds,
      record: args.record,
      onRound: (event) => {
        this.eventEmitter.emit('simulation:round', event)
      }
    })

    this.eventEmitter.emit('simulation:completed', result)

    return {
      success: true,
      totalRounds: result.totalRounds,
      exitReason: result.exitReason
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Kal devkit MCP server running on stdio')
  }
}

// 启动服务器
const server = new DevkitMCPServer()
server.run().catch(console.error)
```

**UI Agent 使用 MCP Client**：

```typescript
// UI 端
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

class UIAgent {
  private mcpClient: Client

  async connect() {
    this.mcpClient = new Client(
      { name: 'kal-ide', version: '1.0.0' },
      { capabilities: {} }
    )

    const transport = new StdioClientTransport({
      command: 'node',
      args: ['./devkit-mcp-server/dist/index.js']
    })

    await this.mcpClient.connect(transport)

    // 订阅事件
    this.mcpClient.setNotificationHandler(async (notification) => {
      if (notification.method === 'notifications/event') {
        const { type, data } = notification.params
        this.handleEvent(type, data)
      }
    })
  }

  async createFlow(name: string) {
    const result = await this.mcpClient.request({
      method: 'tools/call',
      params: {
        name: 'create_flow',
        arguments: { name }
      }
    })

    return JSON.parse(result.content[0].text)
  }

  async addNode(flowId: string, nodeType: string, name: string) {
    const result = await this.mcpClient.request({
      method: 'tools/call',
      params: {
        name: 'add_node',
        arguments: { flowId, nodeType, name }
      }
    })

    return JSON.parse(result.content[0].text)
  }

  private handleEvent(type: string, data: any) {
    switch (type) {
      case 'flow:node:added':
        console.log('节点已添加:', data.nodeId)
        // 更新 UI
        this.updateUI(data)
        break
      case 'simulation:round':
        console.log('模拟回合:', data.round)
        // 更新调试器
        this.updateDebugger(data)
        break
      // ... 更多事件处理
    }
  }

  private updateUI(data: any) {
    // 更新 React Flow UI
  }

  private updateDebugger(data: any) {
    // 更新调试器 UI
  }
}

// 使用
const agent = new UIAgent()
await agent.connect()

const createResult = await agent.createFlow('My Flow')
console.log('创建 Flow:', createResult.flowId)

const addResult = await agent.addNode(
  createResult.flowId,
  'ai.narrative',
  'Narrative Node'
)
console.log('添加节点:', addResult.nodeId)
```

### 12.12 常见问题

**Q: MCP Server 必须使用吗？**

A: 不是必须的。devkit 可以直接在 Node.js 环境中使用。但如果要与 UI Agent 集成，推荐使用 MCP Server。

**Q: 如何处理 MCP Server 连接失败？**

A: 实现自动重连机制：

```typescript
class MCPConnectionManager {
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  async connect() {
    try {
      await this.mcpClient.connect(transport)
      this.reconnectAttempts = 0
      console.log('MCP Server 连接成功')
    } catch (error) {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
        console.log(`连接失败，${delay}ms 后重试...`)
        await sleep(delay)
        await this.connect()
      } else {
        throw new Error('Max reconnection attempts reached')
      }
    }
  }
}
```

**Q: 如何优化 MCP 调用性能？**

A:

1. **使用批量操作**：
```typescript
// 不好：多次调用
for (const node of nodes) {
  await mcpClient.callTool('add_node', node)
}

// 好：批量调用
await mcpClient.callTool('add_nodes_batch', { nodes })
```

2. **使用缓存**：
```typescript
class FlowCache {
  private cache = new Map()
  private ttl = 5 * 60 * 1000 // 5 分钟

  async get(flowId: string) {
    const entry = this.cache.get(flowId)
    if (!entry || Date.now() - entry.timestamp > this.ttl) {
      return null
    }
    return entry.data
  }

  set(flowId: string, data: any) {
    this.cache.set(flowId, { data, timestamp: Date.now() })
  }
}
```

3. **使用增量更新**：
```typescript
// 不好：全量同步
const fullState = await mcpClient.callTool('get_full_state')

// 好：增量更新
const diff = await mcpClient.callTool('get_state_diff', { since: lastTimestamp })
```

4. **并行执行**：
```typescript
// 不好：串行执行
const flow = await mcpClient.callTool('get_flow', { flowId })
const validation = await mcpClient.callTool('validate_flow', { flowId })

// 好：并行执行
const [flow, validation] = await Promise.all([
  mcpClient.callTool('get_flow', { flowId }),
  mcpClient.callTool('validate_flow', { flowId })
])
```

**Q: 如何测试 MCP Server？**

A:

```typescript
// 单元测试
describe('FlowEditorService', () => {
  it('should create flow successfully', async () => {
    const service = new FlowEditorService(new EventEmitter())
    const result = await service.createFlow({ name: 'Test' })
    expect(result.success).toBe(true)
  })
})

// 集成测试
describe('MCP Server Integration', () => {
  let server: DevkitMCPServer
  let client: Client

  beforeEach(async () => {
    server = new DevkitMCPServer()
    client = await createTestClient(server)
  })

  it('should handle tool calls end-to-end', async () => {
    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'create_flow',
        arguments: { name: 'Test Flow' }
      }
    })

    expect(result.success).toBe(true)
  })
})

// 性能测试
describe('MCP Server Performance', () => {
  it('should handle 100 concurrent requests', async () => {
    const requests = Array.from({ length: 100 }, (_, i) =>
      client.callTool('add_node', { flowId: 'test', nodeType: 'ai.narrative', name: `Node ${i}` })
    )

    const startTime = Date.now()
    await Promise.all(requests)
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(5000) // 应该在 5 秒内完成
  })
})
```

**Q: devkit 支持哪些传输方式？**

A: MCP Server 支持两种传输方式：

1. **stdio**（推荐用于本地）：
```typescript
const transport = new StdioServerTransport()
await server.connect(transport)
```

2. **SSE**（推荐用于远程）：
```typescript
const transport = new SSEServerTransport('/mcp', response)
await server.connect(transport)
```

**Q: 如何监控 MCP Server 性能？**

A: 实现性能监控：

```typescript
class PerformanceMonitor {
  private metrics = new Map<string, ToolMetrics>()

  async measureTool<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    const startTime = performance.now()
    const startMemory = process.memoryUsage().heapUsed

    try {
      const result = await fn()
      const duration = performance.now() - startTime
      const memoryDelta = process.memoryUsage().heapUsed - startMemory

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
    if (toolName) return this.metrics.get(toolName)
    return Object.fromEntries(this.metrics)
  }

  printReport() {
    console.log('\n=== MCP Server Performance Report ===')
    for (const [toolName, metrics] of this.metrics) {
      console.log(`\n${toolName}:`)
      console.log(`  Calls: ${metrics.calls}`)
      console.log(`  Avg Duration: ${metrics.avgDuration.toFixed(2)}ms`)
      console.log(`  Errors: ${metrics.errors}`)
      console.log(`  Success Rate: ${((1 - metrics.errors / metrics.calls) * 100).toFixed(1)}%`)
    }
  }
}

// 使用
const perfMonitor = new PerformanceMonitor()

async function executeToolWithMonitoring(toolName: string, args: any) {
  return await perfMonitor.measureTool(toolName, async () => {
    return await executeTool(toolName, args)
  })
}

// 定期打印报告
setInterval(() => {
  perfMonitor.printReport()
}, 60000) // 每分钟
```

**Q: 如何处理 MCP Server 崩溃？**

A: 实现健康检查和自动重启：

```typescript
// 健康检查
class HealthChecker {
  private lastHeartbeat = Date.now()
  private heartbeatInterval = 30000 // 30 秒

  startMonitoring() {
    setInterval(() => {
      const now = Date.now()
      if (now - this.lastHeartbeat > this.heartbeatInterval * 2) {
        console.error('MCP Server 无响应，尝试重启...')
        this.restartServer()
      }
    }, this.heartbeatInterval)
  }

  updateHeartbeat() {
    this.lastHeartbeat = Date.now()
  }

  private async restartServer() {
    try {
      await this.stopServer()
      await sleep(1000)
      await this.startServer()
      console.log('MCP Server 重启成功')
    } catch (error) {
      console.error('MCP Server 重启失败:', error)
    }
  }
}

// 进程监控
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  // 记录错误日志
  logError(error)
  // 优雅退出
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  logError(reason)
})
```

**Q: 如何调试 MCP 通信？**

A: 启用调试日志：

```typescript
// 启用 MCP 调试日志
const server = new Server(
  { name: 'kal-devkit', version: '1.0.0' },
  {
    capabilities: { tools: {} },
    // 启用调试模式
    debug: true
  }
)

// 记录所有请求和响应
server.setRequestHandler('tools/call', async (request) => {
  console.log('[MCP Request]', JSON.stringify(request, null, 2))

  try {
    const result = await handleToolCall(request)
    console.log('[MCP Response]', JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    console.error('[MCP Error]', error)
    throw error
  }
})

// 记录所有事件
server.notification = async (notification) => {
  console.log('[MCP Notification]', JSON.stringify(notification, null, 2))
  await originalNotification(notification)
}
```
