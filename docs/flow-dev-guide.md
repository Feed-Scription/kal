# @kal-ai/core/flow 开发文档

## Context

`@kal-ai/core/flow` 负责 AI 调用的异步编排，核心抽象是 Flow（DAG 节点图）。它解决游戏开发中 AI 调用的并发管理、异步预生成、状态一致性等痛点，让开发者只需声明节点间的依赖关系，框架自动完成拓扑排序、并行执行和写冲突检测。

作为 `@kal-ai/core` 的一部分，flow 模块与 Model、StateManager、CacheManager 等核心组件紧密集成。

### 会议共识（2026-02-24）

- Flow 是响应式触发的 DAG，不是自动无限循环；需要持续触发的场景通过计时器节点实现
- Flow 可以作为 Node 使用（SubFlow 复用），一个 SubFlow 对应一个 JSON 文件
- 所有接口和数据流定义为 JSON 格式
- SubFlow 间需要 DAG 环检测，防止循环调用导致死锁
- interact 节点用于等待用户输入，会阻断后续节点执行
- Flow 与游戏逻辑代码解耦：Flow 负责 AI 编排，游戏逻辑由游戏引擎控制
- Flow 可以作为 Tool 注册，供大模型在 function calling 中调用
- 两种集成模式：Module 模式（AI 子系统）和 Native 模式（大模型做主循环）

### 两种使用模式

KAL 支持两种集成模式，开发者根据游戏类型选择：

**Module 模式（保守）** — KAL 作为传统游戏引擎的 AI 子系统

```
游戏引擎 Main Loop
  ├── 渲染系统
  ├── 物理系统
  ├── AI 系统 ← KAL（core + flow）
  │     ├── 叙事生成 Flow
  │     ├── NPC 对话 Flow
  │     └── 数值模拟 Flow
  └── UI 系统
```

游戏引擎控制主循环，KAL 只在需要 AI 能力时被调用。Flow 由游戏逻辑触发，结果回传给游戏引擎。适用于有成熟游戏引擎（Unity、Godot、Web 框架）的项目。

**Native 模式（激进）** — 大模型作为核心决策者

```
大模型 Main Loop（chat completion 循环）
  ├── 系统 Prompt（游戏规则、世界观）
  ├── Tools / MCP
  │     ├── Flow A → 叙事生成（注册为 Tool）
  │     ├── Flow B → 数值模拟（注册为 Tool）
  │     ├── update_state → 状态更新
  │     └── get_state → 状态查询
  └── 用户输入 → 大模型决策 → 调用 Tools → 输出
```

大模型自身作为游戏的决策引擎，通过 function calling 调用 Flow 和其他工具。适用于 AI Native 游戏（如纯文字冒险、AI 驱动的模拟器）。在此模式下，Flow 需要被注册为 Tool（见"Flow as Tool 桥接"一节）。

> 会议讨论参考：朱桐提出"当大模型它自己就是那个 main loop 本身的时候，外部的这些 flow 是以 tools 的形式来封装"；吴孟松补充"大模型可能只能负责一个子系统，并没有做到真正的 main loop"。两种模式均需支持，由开发者根据场景选择。

## 一、模块划分

| 模块 | 职责 | 对外暴露 |
|------|------|----------|
| `types` | Flow、Node、Edge、Port 等类型定义 | 类型定义 |
| `graph` | DAG 构建、拓扑排序、环检测、写冲突检测、端口类型校验 | FlowGraph |
| `executor` | Flow 执行引擎、并发控制、调度 | FlowExecutor |
| `nodes` | 内置节点类型（interact、timer、subflow 等） | 内置节点工厂 |
| `registry` | 节点类型注册表（端口定义、可编辑参数、分类） | NodeTypeRegistry |
| `serialization` | Flow JSON 序列化/反序列化、校验 | FlowSerializer |

## 二、目录结构

```
packages/core/src/flow/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── node.ts          # Node 定义
│   │   ├── flow.ts          # Flow / SubFlow 定义
│   │   ├── edge.ts          # 依赖边
│   │   ├── port.ts          # 端口类型系统
│   │   ├── execution.ts     # 执行状态、结果
│   │   └── events.ts        # 事件类型
│   ├── graph/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── flow-graph.ts    # DAG 构建 + 拓扑排序
│   │   ├── cycle-detector.ts
│   │   └── conflict-detector.ts  # 写冲突检测
│   ├── executor/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── flow-executor.ts
│   │   ├── scheduler.ts     # 调度器（优先级 + 并发控制）
│   │   └── node-runner.ts   # 单节点执行
│   ├── nodes/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── interact-node.ts # 等待用户输入
│   │   ├── timer-node.ts    # 计时器触发
│   │   └── subflow-node.ts  # SubFlow 嵌套
│   ├── registry/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   └── node-type-registry.ts  # 节点类型注册表
│   └── serialization/
│       ├── index.ts
│       ├── interfaces.ts
│       ├── flow-serializer.ts
│       └── flow-validator.ts
└── __tests__/
    ├── graph/
    ├── executor/
    ├── nodes/
    └── serialization/
```

## 三、核心接口定义

### 3.0 错误类型

```typescript
// types/errors.ts
import { KalError } from '@kal-ai/core'

export class FlowError extends KalError {
  constructor(message: string, readonly flowId: string, cause?: unknown) {
    super(message, 'FLOW_ERROR', cause)
    this.name = 'FlowError'
  }
}

export class NodeError extends KalError {
  constructor(message: string, readonly nodeId: string, cause?: unknown) {
    super(message, 'NODE_ERROR', cause)
    this.name = 'NodeError'
  }
}

export class ValidationError extends KalError {
  constructor(message: string, readonly errors: readonly import('./graph').FlowGraphError[], cause?: unknown) {
    super(message, 'VALIDATION_ERROR', cause)
    this.name = 'ValidationError'
  }
}
```

> `FlowError` 和 `NodeError` 继承自 core 的 `KalError`，可统一用 `instanceof KalError` 捕获。`ValidationError` 在 `FlowGraph.validate()` 返回 `valid: false` 时由 `FlowExecutor.load()` 抛出。节点 `run` 函数内部抛出的任意错误会被包装为 `NodeError` 记录在 `NodeResult.error` 中，不会向上传播（见节点错误传播规则）。

### 3.1 types — 节点与 Flow 类型

#### types/node.ts

```typescript
import type { ModelRequest, StreamChunk, TokenUsage } from '@kal-ai/core'

/** 节点优先级：interactive 最高（用户正在等待），prefetch 中等，background 最低 */
export type NodePriority = 'interactive' | 'prefetch' | 'background'

/** 节点类型标识 */
export type NodeKind = 'compute' | 'interact' | 'timer' | 'subflow'

/** 节点缓存配置 */
export interface NodeCacheConfig {
  readonly enabled: boolean
  readonly ttlMs?: number
  readonly layer?: 'l1' | 'l2' | 'l3'
}

/** 节点定义 — 开发者声明的静态描述 */
export interface NodeDefinition<T = unknown> {
  readonly id: string
  readonly kind: NodeKind
  readonly run: (ctx: NodeContext) => Promise<T>
  readonly dependsOn?: readonly string[]
  readonly writes?: readonly string[]
  /** 输入端口定义（端口-中心模型） */
  readonly inputs?: readonly PortDefinition[]
  /** 输出端口定义（端口-中心模型） */
  readonly outputs?: readonly PortDefinition[]
  readonly streaming?: boolean
  readonly onChunk?: (chunk: StreamChunk) => void
  readonly onReady?: (result: T) => void
  readonly onProgress?: (progress: NodeProgress) => void
  readonly model?: readonly string[]
  readonly idempotent?: boolean
  readonly cache?: NodeCacheConfig
  readonly priority?: NodePriority
}

/** 节点执行时的上下文 */
export interface NodeContext {
  readonly nodeId: string
  readonly state: Readonly<Record<string, unknown>>
  /** @deprecated 使用 inputs 替代，保留向后兼容 */
  readonly deps: Readonly<Record<string, unknown>>
  /** 端口-中心模型：按输入端口名获取上游数据 */
  readonly inputs: Readonly<Record<string, unknown>>
  readonly core: import('@kal-ai/core').KalCore
  readonly signal: AbortSignal
}

export interface NodeProgress {
  readonly nodeId: string
  readonly percent: number
  readonly message?: string
}
```

#### types/flow.ts

```typescript
import type { NodeDefinition } from './node'
import type { PortConnection } from './port'

/**
 * Flow 定义 — 运行时使用的 TypeScript 对象。
 *
 * 术语说明：
 * - FlowDefinition：运行时对象，包含 NodeDefinition（含 handler 函数引用），由代码构造
 * - FlowJson：持久化格式，包含 FlowNodeJson（无函数引用），用于编辑器和文件存储
 * - "Flow" 在文档中泛指两者，具体类型由上下文决定
 *
 * 典型流程：编辑器生成 FlowJson → 序列化为文件 → 运行时反序列化 + 绑定 handler → FlowDefinition
 */
export interface FlowDefinition {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly nodes: readonly NodeDefinition[]
  /** 端口连接关系（端口-中心模型），不提供则退化为 dependsOn 模式 */
  readonly connections?: readonly PortConnection[]
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** SubFlow 引用 — 在父 Flow 中引用另一个 Flow 作为节点 */
export interface SubFlowRef {
  readonly flowId: string
  readonly inputMapping?: Readonly<Record<string, string>>
  readonly outputMapping?: Readonly<Record<string, string>>
}
```

#### types/port.ts

```typescript
// types/port.ts

/**
 * 端口类型系统 — 端口-中心数据流模型的基础
 *
 * 设计理念：类似 ComfyUI，每个节点通过输入/输出端口连接。
 * 端口有明确的类型，编辑器据此做连线校验和类型提示。
 * 运行时 executor 通过端口连接关系传递数据，替代隐式的 dependsOn + deps。
 */

/** 端口数据类型 — 可扩展的联合类型 */
export type PortDataType =
  | 'string'       // 纯文本
  | 'number'       // 数值
  | 'boolean'      // 布尔
  | 'json'         // 任意 JSON 对象
  | 'text'         // 长文本（叙事、对话等，语义区分于 string）
  | 'image'        // 图片 URL 或 base64
  | 'audio'        // 音频
  | 'video'        // 视频
  | 'mmc'          // MMC 多模态内容块
  | 'state-ref'    // State 路径引用（如 'player.hp'）
  | 'prompt'       // PromptNode（compose 产出的 resolved messages）
  | 'flow-result'  // FlowResult（SubFlow 输出）
  | 'any'          // 通配，可连接任意类型

/** 端口定义 — 描述一个输入或输出端口 */
export interface PortDefinition {
  /** 端口名称（同一节点内唯一） */
  readonly name: string
  /** 端口数据类型 */
  readonly type: PortDataType
  /** 端口描述（编辑器 tooltip） */
  readonly description?: string
  /** 是否必填（仅 input 端口有效），默认 true */
  readonly required?: boolean
  /** 默认值（仅 input 端口有效） */
  readonly defaultValue?: unknown
  /** 是否允许多条连线（仅 input 端口：多个源汇聚；仅 output 端口：扇出） */
  readonly multiple?: boolean
}

/** 端口连接 — 描述两个端口之间的数据流 */
export interface PortConnection {
  /** 源节点 ID */
  readonly fromNode: string
  /** 源节点的输出端口名 */
  readonly fromPort: string
  /** 目标节点 ID */
  readonly toNode: string
  /** 目标节点的输入端口名 */
  readonly toPort: string
}

/** 端口类型兼容性规则 */
export type PortCompatibility = 'exact' | 'coercible' | 'incompatible'

/**
 * 类型兼容矩阵（简化版）：
 * - exact: 类型完全匹配
 * - coercible: 可隐式转换（如 number → string, text → string）
 * - any 类型与所有类型兼容
 * - mmc 可接受 text/image/audio/video
 */
export function checkPortCompatibility(
  source: PortDataType,
  target: PortDataType
): PortCompatibility
```

#### types/execution.ts

```typescript
import type { TokenUsage } from '@kal-ai/core'

export type NodeStatus =
  | 'pending'     // 等待前置依赖
  | 'ready'       // 前置已完成，等待调度
  | 'running'     // 执行中
  | 'completed'   // 已完成
  | 'failed'      // 执行失败
  | 'blocked'     // 被 interact 阻断（等待用户输入）
  | 'pre-submitted' // interact 节点已收到提前提交的输入，等待执行
  | 'skipped'     // 被跳过（条件不满足）

export type FlowStatus =
  | 'idle'        // 未启动
  | 'running'     // 执行中
  | 'blocked'     // 等待用户输入（interact 节点）
  | 'completed'   // 全部节点完成
  | 'failed'      // 存在失败节点

export interface NodeResult<T = unknown> {
  readonly nodeId: string
  readonly status: NodeStatus
  readonly value?: T
  readonly error?: Error
  readonly startedAt?: number
  readonly completedAt?: number
  readonly usage?: TokenUsage
}

export interface FlowResult {
  readonly flowId: string
  readonly status: FlowStatus
  readonly nodeResults: Readonly<Record<string, NodeResult>>
  readonly totalUsage: TokenUsage
  readonly startedAt: number
  readonly completedAt?: number
}
```

#### types/events.ts

```typescript
import type { NodeResult, FlowStatus } from './execution'

export type FlowEvent =
  | { readonly type: 'node:ready'; readonly nodeId: string }
  | { readonly type: 'node:start'; readonly nodeId: string }
  | { readonly type: 'node:complete'; readonly result: NodeResult }
  | { readonly type: 'node:fail'; readonly nodeId: string; readonly error: Error }
  | {
      readonly type: 'node:blocked'
      readonly nodeId: string
      readonly interact: {
        readonly inputSchema?: Record<string, unknown>
        readonly timeout?: number
        readonly state: Readonly<Record<string, unknown>>
      }
    }
  | { readonly type: 'flow:status'; readonly status: FlowStatus }
  | { readonly type: 'flow:complete'; readonly result: import('./execution').FlowResult }
```

### 3.2 graph — DAG 构建与校验

```typescript
// graph/interfaces.ts

import type { NodeDefinition, FlowDefinition } from '../types'

/** 拓扑排序结果 — 按层级分组，同层可并行 */
export interface TopologicalLayers {
  readonly layers: readonly (readonly string[])[]
  readonly nodeCount: number
}

/** 写冲突信息 */
export interface WriteConflict {
  readonly field: string
  readonly nodeIds: readonly string[]
  readonly message: string
}

/** 环检测结果 */
export interface CycleDetectionResult {
  readonly hasCycle: boolean
  readonly cycle?: readonly string[]
}

/** DAG 图 — 管理节点和依赖关系 */
export interface FlowGraph {
  /** 从 FlowDefinition 构建图 */
  build(flow: FlowDefinition): void

  /** 添加单个节点 */
  addNode(node: NodeDefinition): void

  /** 移除节点 */
  removeNode(nodeId: string): void

  /** 获取节点定义 */
  getNode(nodeId: string): NodeDefinition | undefined

  /** 获取所有节点 ID */
  getNodeIds(): readonly string[]

  /** 获取节点的直接前置依赖 */
  getDependencies(nodeId: string): readonly string[]

  /** 获取节点的直接后继 */
  getDependents(nodeId: string): readonly string[]

  /** 拓扑排序 — 返回按层级分组的执行顺序 */
  topologicalSort(): TopologicalLayers

  /** 环检测 — 包括 SubFlow 间的引用 */
  detectCycles(): CycleDetectionResult

  /** 写冲突检测 — 同层并行节点写同一 State 字段 */
  detectWriteConflicts(): readonly WriteConflict[]

  /** 校验图的完整性（依赖存在性、环、写冲突） */
  validate(): FlowGraphValidation
}

export interface FlowGraphValidation {
  readonly valid: boolean
  readonly errors: readonly FlowGraphError[]
}

export interface FlowGraphError {
  readonly code:
    | 'MISSING_DEPENDENCY'
    | 'CYCLE_DETECTED'
    | 'WRITE_CONFLICT'
    | 'DUPLICATE_NODE'
    | 'PORT_TYPE_MISMATCH'       // 端口类型不兼容
    | 'PORT_NOT_FOUND'           // 引用了不存在的端口
    | 'REQUIRED_PORT_UNCONNECTED' // 必填输入端口未连接
    | 'FLOW_TOOL_HAS_INTERACT'   // Flow as Tool 中包含 interact 节点
  readonly message: string
  readonly nodeIds?: readonly string[]
}
```

**节点错误传播规则：**

节点 `run` 函数抛出异常时：
1. 该节点状态变为 `failed`，`NodeResult.error` 记录异常
2. 所有直接或间接依赖该节点的后继节点状态变为 `skipped`
3. 不依赖该节点的其他分支继续正常执行
4. 所有节点完成（含 failed/skipped）后，Flow 状态变为 `failed`
5. `executor.wait()` 正常 resolve（不 reject），通过 `FlowResult.status` 判断是否有失败

```typescript
const result = await executor.wait()
if (result.status === 'failed') {
  for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
    if (nodeResult.status === 'failed') {
      console.error(`节点 ${nodeId} 失败:`, nodeResult.error)
    }
  }
}
```

**SubFlow 循环检测语义：**

`detectCycles()` 在 `validate()` 阶段同步执行，采用深度优先搜索。SubFlow 引用（`SubFlowRef`）在检测时被展开为内联节点处理——即将被引用 Flow 的节点图合并到当前图中进行检测。SubFlow 定义必须在 `validate()` 调用前通过 `FlowGraph.registerSubFlow()` 预加载，否则抛 `MISSING_SUBFLOW` 错误。

### 3.3 executor — Flow 执行引擎

```typescript
// executor/interfaces.ts

import type {
  FlowDefinition, NodePriority, FlowEvent,
  FlowResult, NodeResult, FlowStatus
} from '../types'
import type { KalCore } from '@kal-ai/core'

/** 并发控制配置 */
export interface ConcurrencyConfig {
  /** 全局最大并发节点数，默认 10 */
  readonly maxConcurrent?: number
  /** 按模型限制并发，key 为模型名 */
  readonly perModel?: Readonly<Record<string, number>>
}

/** Flow 执行器配置 */
export interface FlowExecutorOptions {
  readonly core: KalCore
  readonly concurrency?: ConcurrencyConfig
  readonly onEvent?: (event: FlowEvent) => void
  readonly signal?: AbortSignal
}

/** Flow 执行器 — 运行一个 Flow DAG */
export interface FlowExecutor {
  /** 加载 Flow 定义并校验 */
  load(flow: FlowDefinition): FlowGraphValidation

  /** 启动执行 — 响应式推进，前序完成则自动调度后续 */
  start(): Promise<void>

  /** 获取当前 Flow 状态 */
  getStatus(): FlowStatus

  /** 按需获取节点输出（节点未完成则等待） */
  get<T = unknown>(nodeId: string): Promise<T>

  /** 非阻塞获取节点输出（未完成返回 undefined） */
  peek<T = unknown>(nodeId: string): NodeResult<T> | undefined

  /** 向 interact 节点提交用户输入
   *  - 如果节点还未执行到，输入会被缓存，节点执行到时立即使用
   *  - 如果节点已经 blocked，输入会立即解除阻断
   *  - 如果节点已经 completed，抛出错误
   *  - input 会根据 inputSchema 校验，不通过则抛 ValidationError */
  submit(nodeId: string, input: unknown): void

  /** 取消执行 */
  abort(): void

  /** 重置执行状态，保留 Flow 定义，可重新 start */
  restart(): void

  /** 等待 Flow 执行完成 */
  wait(): Promise<FlowResult>

  /** 订阅事件 */
  on(listener: (event: FlowEvent) => void): () => void
}

/** 调度器 — 管理节点执行队列和并发 */
export interface Scheduler {
  /** 将就绪节点加入队列 */
  enqueue(nodeId: string, priority: NodePriority): void

  /** 获取下一个可执行的节点（受并发限制） */
  dequeue(): string | undefined

  /** 标记节点执行完成，释放并发槽位 */
  release(nodeId: string): void

  /** 当前正在执行的节点数 */
  readonly runningCount: number
}
```

### 3.4 nodes — 内置节点类型

```typescript
// nodes/interfaces.ts

import type { NodeDefinition, NodeContext, SubFlowRef } from '../types'

/** interact 节点 — 等待用户输入后继续 */
export interface InteractNodeConfig {
  readonly id: string
  /** 输入的 JSON Schema（标准 JSON Schema Draft-7，用于校验 submit 的 input）
   *  校验在 executor.submit() 时执行，不通过则抛 ValidationError，节点保持 blocked 状态 */
  readonly inputSchema?: Record<string, unknown>
  /** 超时毫秒数，超时后使用 defaultValue 自动提交 */
  readonly timeout?: number
  /** 超时时的默认值 */
  readonly defaultValue?: unknown
  readonly dependsOn?: readonly string[]
  readonly writes?: readonly string[]
  readonly priority?: 'interactive'
}

/** 创建 interact 节点 */
export function createInteractNode(config: InteractNodeConfig): NodeDefinition<unknown>

/** timer 节点 — 按间隔或延迟触发 */
export interface TimerNodeConfig {
  readonly id: string
  readonly delayMs?: number
  readonly intervalMs?: number
  readonly maxTriggers?: number
  readonly dependsOn?: readonly string[]
}

/** 创建 timer 节点 */
export function createTimerNode(config: TimerNodeConfig): NodeDefinition<void>

/** subflow 节点 — 将另一个 Flow 作为节点嵌入 */
export interface SubFlowNodeConfig {
  readonly id: string
  readonly ref: SubFlowRef
  readonly dependsOn?: readonly string[]
  readonly writes?: readonly string[]
  readonly priority?: import('../types').NodePriority
}

/** 创建 subflow 节点 */
export function createSubFlowNode(config: SubFlowNodeConfig): NodeDefinition<import('../types/execution').FlowResult>
```

### 3.5 serialization — Flow JSON 序列化

```typescript
// serialization/interfaces.ts

import type { FlowDefinition } from '../types'
import type { FlowGraphValidation } from '../graph/interfaces'

/** Flow JSON 格式 — 用于持久化和 UI 编辑器交换 */
export interface FlowJson {
  readonly version: '1.0'
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly nodes: readonly FlowNodeJson[]
  /** 端口连接关系（端口-中心模型） */
  readonly connections?: readonly PortConnectionJson[]
  readonly metadata?: Record<string, unknown>
}

/** 端口连接的 JSON 表示 */
export interface PortConnectionJson {
  readonly fromNode: string
  readonly fromPort: string
  readonly toNode: string
  readonly toPort: string
}

export interface FlowNodeJson {
  readonly id: string
  readonly kind: 'compute' | 'interact' | 'timer' | 'subflow'
  /** 节点类型 ID（引用 NodeTypeRegistry 中注册的类型） */
  readonly type?: string
  readonly dependsOn?: readonly string[]
  readonly writes?: readonly string[]
  /** 输入端口定义（覆盖 NodeTypeRegistry 中的默认定义） */
  readonly inputs?: readonly PortDefinitionJson[]
  /** 输出端口定义（覆盖 NodeTypeRegistry 中的默认定义） */
  readonly outputs?: readonly PortDefinitionJson[]
  readonly model?: readonly string[]
  readonly priority?: 'interactive' | 'prefetch' | 'background'
  readonly streaming?: boolean
  readonly idempotent?: boolean
  readonly cache?: { enabled: boolean; ttlMs?: number }
  /** compute 节点：引用的处理函数名（由开发者注册） */
  readonly handler?: string
  /** 关联的 PromptNode 组合（编辑器属性面板可直接编辑 prompt） */
  readonly promptNodeId?: string
  /** 节点级别模型参数覆盖（编辑器属性面板可调整） */
  readonly modelOverrides?: {
    readonly maxTokens?: number
    readonly temperature?: number
    readonly topP?: number
  }
  /** interact 节点配置 */
  readonly interact?: {
    inputSchema?: Record<string, unknown>
    timeout?: number
    defaultValue?: unknown
  }
  /** timer 节点配置 */
  readonly timer?: { delayMs?: number; intervalMs?: number; maxTriggers?: number }
  /** subflow 节点配置 */
  readonly subflow?: {
    readonly flowId: string
    readonly inputMapping?: Record<string, string>
    readonly outputMapping?: Record<string, string>
  }
  /** UI 编辑器元数据（节点位置、尺寸、样式等，运行时忽略） */
  readonly ui?: {
    readonly position?: { readonly x: number; readonly y: number }
    readonly size?: { readonly width: number; readonly height: number }
    readonly color?: string
    readonly collapsed?: boolean
    readonly comment?: string
  }
}

/** 端口定义的 JSON 表示 */
export interface PortDefinitionJson {
  readonly name: string
  readonly type: import('../types/port').PortDataType
  readonly description?: string
  readonly required?: boolean
  readonly defaultValue?: unknown
  readonly multiple?: boolean
}

export interface FlowSerializer {
  /** FlowDefinition → JSON（需要 handler 注册表来反向映射 run 函数） */
  serialize(flow: FlowDefinition): FlowJson

  /** JSON → FlowDefinition（需要 handler 注册表来查找 run 函数） */
  deserialize(json: FlowJson, handlers: HandlerRegistry): FlowDefinition

  /** 校验 JSON 结构合法性 + DAG 合法性 */
  validate(json: FlowJson): FlowGraphValidation
}

/** handler 注册表 — 将 JSON 中的 handler 名映射到实际函数 */
export interface HandlerRegistry {
  register(name: string, handler: (ctx: import('../types').NodeContext) => Promise<unknown>): void
  get(name: string): ((ctx: import('../types').NodeContext) => Promise<unknown>) | undefined
  list(): readonly string[]
}
```

### 3.6 types/edge.ts — 依赖边

```typescript
// types/edge.ts

/**
 * DAG 中的依赖边（graph 模块内部表示，也供 editor 消费）
 *
 * 统一表示两种模式：
 * - dependsOn 模式：仅 from/to（节点级别），fromPort/toPort 为 undefined
 * - 端口-中心模式：from/to + fromPort/toPort（端口级别）
 *
 * graph 模块在 build() 时，会将 FlowDefinition.connections（PortConnection 格式）
 * 和 NodeDefinition.dependsOn 统一转换为 FlowEdge 内部表示。
 */
export interface FlowEdge {
  /** 源节点 ID */
  readonly from: string
  /** 目标节点 ID */
  readonly to: string
  /** 端口-中心模型：源节点的输出端口名 */
  readonly fromPort?: string
  /** 端口-中心模型：目标节点的输入端口名 */
  readonly toPort?: string
}
```

### 3.7 registry — 节点类型注册表

```typescript
// registry/interfaces.ts

import type { PortDefinition, PortDataType } from '../types/port'
import type { NodeKind } from '../types/node'

/** 节点类型分类（编辑器侧边栏分组） */
export type NodeCategory =
  | 'ai'           // AI 调用相关（LLM 调用、prompt 构建）
  | 'logic'        // 逻辑控制（条件、分支、合并）
  | 'data'         // 数据处理（格式转换、JSON 解析）
  | 'interaction'  // 用户交互（interact、UI 输入）
  | 'flow-control' // 流程控制（timer、subflow）
  | 'state'        // 状态读写
  | 'custom'       // 用户自定义

/** 节点可编辑参数定义（编辑器属性面板渲染） */
export interface NodeParamDefinition {
  /** 参数名 */
  readonly name: string
  /** 参数类型（决定属性面板的控件类型） */
  readonly type: 'string' | 'number' | 'boolean' | 'select' | 'text' | 'json' | 'prompt'
  /** 显示标签 */
  readonly label: string
  /** 描述（tooltip） */
  readonly description?: string
  /** 默认值 */
  readonly defaultValue?: unknown
  /** select 类型的选项列表 */
  readonly options?: readonly { readonly label: string; readonly value: unknown }[]
  /** 是否必填 */
  readonly required?: boolean
  /** 数值范围（type 为 number 时有效） */
  readonly min?: number
  readonly max?: number
  readonly step?: number
}

/**
 * 节点类型定义 — 描述一种可复用的节点类型
 *
 * 类比 ComfyUI 的节点类：定义了节点的输入/输出端口、可编辑参数、分类等元信息。
 * 编辑器据此渲染节点面板、属性面板和连线校验。
 */
export interface NodeTypeDefinition {
  /** 节点类型唯一 ID（如 'ai.llm-call', 'logic.condition'） */
  readonly id: string
  /** 显示名称 */
  readonly name: string
  /** 描述 */
  readonly description?: string
  /** 分类 */
  readonly category: NodeCategory
  /** 节点种类 */
  readonly kind: NodeKind
  /** 输入端口定义 */
  readonly inputs: readonly PortDefinition[]
  /** 输出端口定义 */
  readonly outputs: readonly PortDefinition[]
  /** 可编辑参数（编辑器属性面板） */
  readonly params?: readonly NodeParamDefinition[]
  /** 对应的 handler 名（compute 节点） */
  readonly handler?: string
  /** 节点图标（编辑器渲染用，如 'brain', 'chat', 'timer'） */
  readonly icon?: string
  /** 节点默认颜色 */
  readonly color?: string
}

/**
 * 节点类型注册表 — 管理所有可用的节点类型
 *
 * 编辑器通过此注册表获取可用节点列表、渲染节点面板、做连线校验。
 * 内置节点类型（interact、timer、subflow）在框架初始化时自动注册。
 */
export interface NodeTypeRegistry {
  /** 注册节点类型 */
  register(definition: NodeTypeDefinition): void

  /** 批量注册 */
  registerAll(definitions: readonly NodeTypeDefinition[]): void

  /** 获取节点类型定义 */
  get(typeId: string): NodeTypeDefinition | undefined

  /** 按分类获取节点类型列表 */
  getByCategory(category: NodeCategory): readonly NodeTypeDefinition[]

  /** 获取所有已注册的节点类型 */
  list(): readonly NodeTypeDefinition[]

  /** 获取所有分类 */
  getCategories(): readonly NodeCategory[]

  /** 移除节点类型 */
  remove(typeId: string): void

  /** 检查两个端口是否可连接 */
  canConnect(
    sourceTypeId: string, sourcePort: string,
    targetTypeId: string, targetPort: string
  ): import('../types/port').PortCompatibility
}
```

**NodeTypeRegistry 初始化流程：**

```typescript
import { createNodeTypeRegistry, getBuiltinNodeTypes } from '@kal-ai/core/flow'

// 1. 创建 registry
const registry = createNodeTypeRegistry()

// 2. 注册内置节点类型（interact、timer、subflow）
registry.registerAll(getBuiltinNodeTypes())

// 3. 注册开发者自定义节点类型
registry.register({
  id: 'ai.narrative',
  name: '叙事生成',
  kind: 'compute',
  category: 'ai',
  inputs: [{ name: 'context', type: 'text', required: true }],
  outputs: [{ name: 'narrative', type: 'text' }],
  params: [{ name: 'model', type: 'select', label: '模型', options: [] }],
})

// 4. 传给编辑器（只读消费，不修改）
editor.setNodeTypeRegistry(registry)

// 5. 传给 FlowSerializer（反序列化时校验端口连接合法性）
const serializer = createFlowSerializer({ registry })
```

> registry 在运行时是可变的（可随时注册新类型），但 executor 执行期间不应修改。编辑器和 serializer 持有同一个 registry 实例，保证类型定义一致。

### 3.8 工厂函数汇总

```typescript
// ---- graph ----
export function createFlowGraph(): FlowGraph

// ---- executor ----
export function createFlowExecutor(options: FlowExecutorOptions): FlowExecutor

// ---- serialization ----
export function createFlowSerializer(options?: { registry?: NodeTypeRegistry }): FlowSerializer
export function createHandlerRegistry(): HandlerRegistry

// ---- nodes ----
export function createInteractNode(config: InteractNodeConfig): NodeDefinition<unknown>
export function createTimerNode(config: TimerNodeConfig): NodeDefinition<void>
export function createSubFlowNode(config: SubFlowNodeConfig): NodeDefinition<FlowResult>

// ---- registry ----
export function createNodeTypeRegistry(): NodeTypeRegistry
/** 获取框架内置节点类型定义（interact、timer、subflow） */
export function getBuiltinNodeTypes(): readonly NodeTypeDefinition[]

// ---- port ----
export function checkPortCompatibility(source: PortDataType, target: PortDataType): PortCompatibility

// ---- Flow as Tool 桥接 ----
export function createFlowToolBridge(options: { readonly core: KalCore }): FlowToolBridge
```

> 说明：`Scheduler` 是 `FlowExecutor` 的内部实现细节，不对外暴露工厂函数。内置节点工厂函数（`createInteractNode`、`createTimerNode`、`createSubFlowNode`）创建的 `NodeDefinition` 会自动填充 `inputs`/`outputs` 端口定义，无需开发者手动声明。对应的端口元信息也包含在 `getBuiltinNodeTypes()` 返回的 `NodeTypeDefinition` 中。

## 四、模块间依赖关系

```
┌──────────────────────────────────────────────────┐
│              @kal-ai/core/flow                     │
│                                                  │
│  types(含 port) ◄── 所有模块都依赖               │
│    ▲                                             │
│  graph ── 依赖 types（含端口类型校验）             │
│    ▲                                             │
│  registry ── 依赖 types（NodeTypeRegistry）       │
│  executor ── 依赖 types + graph + @kal-ai/core    │
│  nodes ── 依赖 types + executor                   │
│  serialization ── 依赖 types + graph + registry   │
│                                                  │
│  对外：createFlowExecutor() 组装全部模块           │
│        createNodeTypeRegistry() 供编辑器消费       │
└──────────────────────────────────────────────────┘
```

关键设计：executor 通过 `KalCore` 获取 Model、StateManager 等能力，flow 模块本身不直接调用大模型，而是委托给 core。registry 模块为编辑器提供节点元信息，serialization 在反序列化时可通过 registry 校验端口连接合法性。

## 五、执行模型详解

### 5.0 端口-中心数据流模型

KAL-AI 采用端口-中心的数据流模型（类似 ComfyUI），每个节点通过输入/输出端口连接，数据沿端口连线流动。

**与 dependsOn 模式的关系：**

| 维度 | dependsOn 模式（旧） | 端口-中心模式（新） |
|------|---------------------|-------------------|
| 依赖声明 | `dependsOn: ['nodeA']` | `connections: [{ fromNode: 'nodeA', fromPort: 'text', toNode: 'nodeB', toPort: 'input' }]` |
| 数据访问 | `ctx.deps.nodeA`（无类型） | `ctx.inputs.input`（有类型约束） |
| 编辑器连线 | 节点到节点（无端口） | 端口到端口（类型校验） |
| 写入 State | `writes: ['player.hp']` | 同上，保留不变 |

两种模式共存，向后兼容：
- 如果 `FlowDefinition` / `FlowJson` 中有 `connections`，executor 按端口连接传递数据
- 如果没有 `connections`，退化为 `dependsOn` 模式（`ctx.deps` 按节点 ID 索引）
- `ctx.inputs` 和 `ctx.deps` 同时可用，`inputs` 按端口名索引，`deps` 按节点 ID 索引

**适用场景：**

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| 纯代码开发（手写 FlowDefinition） | `dependsOn` 模式 | 简洁直观，无需声明端口 |
| 可视化编辑器（拖拉拽） | 端口-中心模式 | 类型校验、端口连线、属性面板 |
| JSON 配置驱动 | 端口-中心模式 | connections 天然可序列化 |
| 混合使用 | 两者共存 | dependsOn 做基础依赖，connections 做精细数据流 |

**端口连接的运行时语义：**

```
节点 A (output port: "text" → string)
    ↓ connection
节点 B (input port: "content" ← string)

运行时：
1. A.run() 返回 { text: "叙事内容..." }
2. executor 按 connection 映射：B 的 ctx.inputs.content = A 的输出.text
3. B.run(ctx) 中通过 ctx.inputs.content 获取上游数据
```

**节点输出与端口的映射规则：**

| 输出端口数 | run 返回值 | 映射方式 |
|-----------|-----------|---------|
| 单端口 | 任意值 T | 直接赋给该端口 |
| 多端口 | `Record<string, unknown>` | key 为端口名，value 为端口值 |

```typescript
// 单输出端口
{
  id: 'narrative',
  outputs: [{ name: 'text', type: 'text' }],
  run: async (ctx) => {
    const res = await ctx.core.model.invoke({ messages: [...] })
    return res.content  // 自动映射到 'text' 端口
  },
}

// 多输出端口
{
  id: 'splitter',
  outputs: [
    { name: 'story', type: 'text' },
    { name: 'stats', type: 'json' },
  ],
  run: async (ctx) => ({
    story: '叙事内容...',
    stats: { hp: 80, mp: 50 },
  }),
}
```

### 5.1 响应式推进

Flow 采用响应式推进而非自动循环：

```
start() → 找到所有无依赖节点 → 并行执行
       → 节点完成 → 检查后继节点的依赖是否全部满足
       → 满足 → 加入调度队列 → 执行
       → 遇到 interact 节点：
          - 如果有提前提交的输入 → 立即使用，继续执行
          - 如果没有提前提交的输入 → 阻断，等待 submit()
       → 所有节点完成 → Flow 结束
```

### 5.2 interact 节点阻断机制

interact 节点支持两种提交模式：

**模式 A：提前提交（推荐）**

前端可以在 interact 节点执行到之前就提前调用 `executor.submit(nodeId, input)`。当节点执行到时，如果已有提前提交的输入，则立即使用该输入继续执行，不进入 `blocked` 状态。

**模式 B：阻断等待**

如果节点执行到时没有提前提交的输入，则进入 `blocked` 状态，其所有后继节点暂停调度。前端收到 `node:blocked` 事件后，调用 `executor.submit(nodeId, input)` 解除阻断。

**执行流程：**

```
1. 前端提前调用 executor.submit('wait-action', input)（可选）
2. Flow 执行到 interact 节点
   - 如果有提前提交的输入 → 立即使用，节点状态变为 completed
   - 如果没有提前提交的输入 → 进入 blocked 状态，触发 node:blocked 事件
3. 前端收到 node:blocked 事件后，调用 executor.submit(nodeId, input)
4. interact 节点的 run 函数收到 input，返回结果
5. 节点状态变为 completed
6. 调度器重新检查后继节点，满足条件的加入队列
```

### 5.2.1 interact 节点与前端数据契约

interact 节点是 Flow 与前端的唯一交互点。这里只约定 Karl 前端会传递过来什么格式的数据，UI 如何展示由前端自行决定。

**FlowEvent — 阻断事件：**

```typescript
// 当 interact 节点进入 blocked 状态时，触发此事件
| {
    readonly type: 'node:blocked'
    readonly nodeId: string
    readonly interact: {
      /** 输入数据的 JSON Schema（用于校验 submit 的 input） */
      readonly inputSchema?: Record<string, unknown>
      /** 超时毫秒数，超时后使用 defaultValue 自动提交 */
      readonly timeout?: number
      /** 当前 State 快照（前端可据此渲染上下文） */
      readonly state: Readonly<Record<string, unknown>>
    }
  }
```

**数据流：**

```
1. 前端订阅 executor.on(event => ...)
2. 前端可以随时调用 executor.submit(nodeId, input) 提前提交输入
   - 如果 interact 节点还未执行到，输入会被缓存
   - 如果 interact 节点已经 blocked，输入会立即解除阻断
   - input 必须符合 interact.inputSchema（如果有）
   - 校验失败则抛 ValidationError
3. 如果节点执行到时没有提前提交的输入，触发 { type: 'node:blocked', nodeId, interact } 事件
4. 前端根据 interact.state 自行决定如何渲染 UI
5. 如果超时未操作，框架自动 submit(nodeId, defaultValue)
```

**示例 1：提前提交（流畅体验）**

```typescript
// 前端在玩家操作时立即提交，无需等待 blocked 事件
onPlayerAction((action) => {
  executor.submit('wait-action', action)
})

// Flow 执行到 wait-action 节点时，直接使用已提交的输入，不阻断
await executor.start()
```

**示例 2：阻断等待（传统模式）**

```typescript
// 前端监听阻断事件
executor.on((event) => {
  if (event.type === 'node:blocked') {
    const { nodeId, interact } = event
    // 前端根据 interact.state 自行决定渲染逻辑
    renderGameUI(interact.state)

    // 玩家操作后提交数据
    onPlayerAction((action) => {
      executor.submit(nodeId, action)
    })
  }
})
```

**示例 3：混合模式（最佳实践）**

```typescript
// 前端可以随时提交，如果节点还未执行到则提前缓存
onPlayerAction((action) => {
  executor.submit('wait-action', action)
})

// 同时监听 blocked 事件，处理未提前提交的情况
executor.on((event) => {
  if (event.type === 'node:blocked') {
    // 显示等待 UI，提示玩家操作
    showWaitingUI(event.interact.state)
  }
})
```

### 5.3 计时器节点

计时器节点不是让 Flow 自动循环，而是作为一个触发源：
- `delayMs`：延迟指定时间后触发一次
- `intervalMs`：按间隔重复触发，每次触发产生一个新的输出
- `maxTriggers`：最大触发次数，达到后节点完成

### 5.4 并发控制

调度器按两个维度控制并发：
- 全局并发上限（`maxConcurrent`）：同时执行的节点总数
- 按模型并发上限（`perModel`）：同一模型的并发调用数

优先级排序：`interactive > prefetch > background`，高优先级节点优先获得执行槽位。

### 5.5 写冲突检测

在 `graph.validate()` 阶段静态检测：同一拓扑层级中，如果两个可并行节点声明写入同一 State 字段，报 `WRITE_CONFLICT` 错误。开发者需通过 `dependsOn` 显式串行化有写冲突的节点。

### 5.5.1 handler 返回值与 State writes 的关系

`writes` 字段有两个作用：

1. **静态写冲突检测**（graph.validate 阶段）：同层并行节点不能写同一字段
2. **自动写入 State**（运行时）：节点 `run` 函数的返回值会被框架自动写入 `writes` 声明的路径

规则如下：

| writes 声明 | run 返回值 | 框架行为 |
|-------------|-----------|----------|
| `writes: ['scene.narrative']`（单路径） | 任意值 T | `state.set('scene.narrative', returnValue)` |
| `writes: ['stats.hp', 'stats.mp']`（多路径） | `Record<string, unknown>` | 按 key 映射：`state.set('stats.hp', returnValue['stats.hp'])` |
| `writes: []` 或不声明 | 任意值 | 不写入 State，返回值仅作为后续节点的 `deps` 输入 |

示例：

```typescript
// 单路径写入 — 返回值直接写入 scene.narrative
{
  id: 'narrative',
  kind: 'compute',
  run: async (ctx) => {
    const res = await ctx.core.model.invoke({
      messages: [{ role: 'user', content: '描述新手村' }]
    })
    return res.content  // 框架自动执行 state.set('scene.narrative', res.content)
  },
  writes: ['scene.narrative'],
}

// 多路径写入 — 返回 Record，按路径映射
{
  id: 'numeric-sim',
  kind: 'compute',
  run: async (ctx) => ({
    'stats.hp': 80,
    'stats.mp': 50,
    'stats.gold': 100,
  }),
  writes: ['stats.hp', 'stats.mp', 'stats.gold'],
}

// 不写入 State — 返回值仅供后续节点通过 deps 消费
{
  id: 'format',
  kind: 'compute',
  run: async (ctx) => `叙事: ${ctx.deps.narrative}`,
  dependsOn: ['narrative'],
  // 无 writes，返回值不写入 State
}
```

`ctx.deps` 的 key 是依赖节点的 id，value 是该节点 `run` 函数的返回值：

```typescript
{
  id: 'summary',
  dependsOn: ['narrative', 'numeric-sim'],
  run: async (ctx) => {
    const story = ctx.deps.narrative       // narrative 节点的返回值（string）
    const stats = ctx.deps['numeric-sim']  // numeric-sim 节点的返回值（Record）
    return `${story}，HP: ${stats['stats.hp']}`
  },
}
```

> 如果开发者需要更复杂的写入逻辑（如条件写入、合并写入），可以在 handler 内部直接调用 `ctx.core.state.set()` / `ctx.core.state.merge()`，此时 `writes` 仍需声明用于写冲突检测，但框架不会重复自动写入（检测到 handler 内部已手动写入时跳过）。

**在 handler 中调用模型：**

handler 可以通过 `ctx.core.model` 直接调用模型，执行 AI 驱动的世界模拟，并将结果手动写回 StateManager：

```typescript
import { compose, base } from '@kal-ai/core'

// 在 Flow 节点中调用模型执行世界模拟
{
  id: 'simulate-action',
  kind: 'compute',
  run: async (ctx) => {
    const worldContext = JSON.stringify({
      player: ctx.state['player'],
      scene: ctx.state['scene'],
    })
    const pending = ctx.state['pending'] as { action: string }
    const action = pending.action
    const { messages } = compose([
      base('system', '你是一个奇幻RPG的世界模拟器。根据世界状态和玩家动作，描述结果并以 JSON 返回状态变更。', { role: 'system' }),
      base('user', `世界状态：${worldContext}\n动作：${action}`, { role: 'user' }),
    ]).resolve({})
    const response = await ctx.core.model.invoke({
      messages,
      responseFormat: { type: 'json_object' },
    })
    const parsed = JSON.parse(response.content!)
    // 开发者自行将 patches 写回 StateManager
    for (const patch of parsed.patches ?? []) {
      ctx.core.state.set(patch.path, patch.value)
    }
    return parsed.narrative
  },
  writes: ['scene.simulationResult'],
}
```

### 5.6 预生成与按需消费

Flow 的响应式推进天然支持预生成：interact 节点之前的无依赖节点会立即执行，结果缓存在内存中。前端消费时通过 `executor.get(nodeId)` 获取——如果节点已完成则立即返回，未完成则等待。`executor.peek(nodeId)` 提供非阻塞查询，适合 UI 轮询场景。

**传统模式（阻断等待）：**

```
start() → narrative(预生成) → 缓存结果
       → history-patch(预生成) → 缓存结果
       → wait-action(interact, 阻断)
                ↓ 用户操作
       → submit() → 后续节点消费预生成结果，无需等待
```

**提前提交模式（流畅体验）：**

```
前端：玩家操作 → submit('wait-action', input)
后端：start() → narrative(预生成) → 缓存结果
            → history-patch(预生成) → 缓存结果
            → wait-action(发现已有提前提交的输入，立即使用)
            → 后续节点继续执行，全程无阻断
```

这解决了会议中周厚全提到的痛点："有些东西它需要提前生成，你没响应的时候它就得跑着了，你点击操作的时候只需要从后端取就行了。"提前提交机制进一步优化了体验，让玩家操作和 AI 生成完全并行，消除等待感。

## 5.7 Flow as Tool 桥接

在 Native 模式下，大模型通过 function calling 调用 Flow。flow 模块提供桥接机制，将 FlowDefinition 注册为 core 的 ToolDefinition。

```typescript
// 桥接接口 — 将 Flow 注册为 Tool

import type { ToolDefinition, ToolHandler, ToolRegistry } from '@kal-ai/core'
import type { FlowDefinition } from '../types'
import type { FlowExecutor } from '../executor/interfaces'

export interface FlowToolBridgeOptions {
  /** 注册为 Tool 时的函数名 */
  readonly toolName: string
  /** Tool 描述（供大模型理解用途） */
  readonly description: string
  /** Flow 定义 */
  readonly flow: FlowDefinition
  /** Flow 接受的输入参数 schema（通过 submit 提前提交或映射到 interact 节点的输入） */
  readonly parameters: Record<string, unknown>
  /** Flow 输出的节点 ID（取该节点的结果作为 Tool 返回值） */
  readonly outputNodeId: string
}

export interface FlowToolBridge {
  /** 将 Flow 包装为 ToolDefinition + ToolHandler */
  wrap(options: FlowToolBridgeOptions): {
    readonly definition: ToolDefinition
    readonly handler: ToolHandler
  }

  /** 批量注册：将多个 Flow 注册到 ToolRegistry */
  registerAll(
    registry: ToolRegistry,
    flows: readonly FlowToolBridgeOptions[]
  ): void
}
```

> **Flow as Tool 的约束：** 注册为 Tool 的 Flow 不能包含 interact 节点。interact 节点需要等待外部 `submit()`，会导致 tool call 永久阻塞。如果 Flow 中存在 interact 节点，`wrap()` 会在校验阶段抛出 `FLOW_TOOL_HAS_INTERACT` 错误。需要用户交互的场景应使用 Module 模式，而非 Native 模式。

使用示例（Native 模式）：

```typescript
import { createKalCore } from '@kal-ai/core'
import { createFlowExecutor, createFlowToolBridge } from '@kal-ai/core/flow'

const core = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    }
  },
  state: { initialState: { player: { hp: 100 }, scene: {} } },
})
const bridge = createFlowToolBridge({ core })

// 将"叙事生成"Flow 注册为 Tool
bridge.registerAll(core.tools, [
  {
    toolName: 'generate_narrative',
    description: '根据玩家行动生成本回合叙事',
    flow: narrativeFlow,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '玩家行动描述' }
      },
      required: ['action']
    },
    outputNodeId: 'narrative',
  },
  {
    toolName: 'run_simulation',
    description: '运行数值模拟，更新游戏状态',
    flow: simulationFlow,
    parameters: {
      type: 'object',
      properties: {
        event: { type: 'string', description: '触发事件' }
      }
    },
    outputNodeId: 'result',
  },
])

// 大模型 Main Loop — 自动通过 function calling 调用 Flow
const result = await core.runWithTools({
  messages: [
    { role: 'system', content: '你是一个奇幻RPG的游戏引擎...' },
    { role: 'user', content: '我要去探索森林' },
  ],
})
```

## 5.8 Flow 生命周期与游戏主循环

Flow 是一次性的 DAG 执行——`start()` 到 `wait()` 完成后，executor 进入 `completed` 状态，不可重复 start。但游戏是由多个回合组成的。开发者需要理解如何用 Flow 驱动游戏主循环。

### 三种模式

**模式 A：每回合创建新 executor（推荐，最简单）**

```typescript
async function gameLoop(core: KalCore, flowDef: FlowDefinition) {
  while (true) {
    const executor = createFlowExecutor({ core })
    executor.load(flowDef)

    // 前端可以提前提交玩家输入（推荐）
    // 例如：玩家在上一回合结束时就选择了下一回合的动作
    // executor.submit('wait-action', playerAction)

    // 启动本回合 Flow
    await executor.start()

    // 如果没有提前提交，等待 interact 节点阻断
    // 前端收到 node:blocked 事件后调用 executor.submit()

    // 等待本回合 Flow 完成
    const result = await executor.wait()

    // State 在 core 中持续累积，跨回合保持
    const hp = core.state.get('player.hp')
    if (hp <= 0) break  // 游戏结束条件
  }
}
```

关键点：每回合新建 executor，但 `KalCore`（及其 StateManager）是共享的，State 跨回合持续累积。

**模式 B：FlowExecutor.restart()（便捷方法）**

```typescript
// restart() 已包含在 FlowExecutor 接口中（见 3.3 节）
```

```typescript
const executor = createFlowExecutor({ core })
executor.load(flowDef)

for (let round = 0; round < maxRounds; round++) {
  await executor.start()
  await executor.wait()
  executor.restart()  // 重置节点状态，保留 Flow 定义
}
```

**模式 C：Native 模式（大模型驱动循环）**

在 Native 模式下，游戏主循环由大模型的 chat completion 循环驱动，Flow 作为 Tool 被按需调用，不需要开发者手动管理 Flow 生命周期：

```typescript
// 大模型自己决定何时调用哪个 Flow
while (true) {
  const result = await core.runWithTools({
    messages: conversationHistory,
  })
  conversationHistory.push(result.response)
  // 大模型通过 function calling 自动调用注册的 Flow Tools
}
```

### 选择建议

| 游戏类型 | 推荐模式 | 原因 |
|----------|----------|------|
| 回合制（青椒、文字冒险） | 模式 A/B | 每回合一个 Flow，结构清晰 |
| 实时/事件驱动 | 模式 A + timer 节点 | timer 节点驱动持续生成 |
| AI Native（纯大模型驱动） | 模式 C | 大模型自主决策，Flow 按需调用 |

## 六、Flow JSON 示例

以青椒模拟器的"季度推进"为例：

```json
{
  "version": "1.0",
  "id": "quarter-advance",
  "name": "季度推进",
  "description": "模拟一个季度的事件生成、历史补丁和数值模拟",
  "nodes": [
    {
      "id": "wait-action",
      "kind": "interact",
      "interact": {
        "inputSchema": {
          "type": "object",
          "properties": {
            "action": { "type": "string" }
          },
          "required": ["action"]
        }
      },
      "writes": ["player.action"],
      "priority": "interactive"
    },
    {
      "id": "narrative",
      "kind": "compute",
      "handler": "generateNarrative",
      "dependsOn": ["wait-action"],
      "writes": ["scene.narrative"],
      "model": ["deepseek-chat"],
      "streaming": true,
      "priority": "interactive"
    },
    {
      "id": "history-patch",
      "kind": "compute",
      "handler": "generateHistoryPatch",
      "dependsOn": ["wait-action"],
      "writes": ["history"],
      "model": ["deepseek-chat"],
      "priority": "prefetch"
    },
    {
      "id": "numeric-sim",
      "kind": "compute",
      "handler": "runNumericSimulation",
      "dependsOn": ["wait-action"],
      "writes": ["stats"],
      "model": ["deepseek-chat"],
      "priority": "prefetch"
    },
    {
      "id": "next-events",
      "kind": "compute",
      "handler": "generateNextEvents",
      "dependsOn": ["narrative", "history-patch", "numeric-sim"],
      "writes": ["events.next"],
      "model": ["deepseek-chat"],
      "priority": "background"
    }
  ]
}
```

执行顺序：
```
wait-action（阻断等待用户输入）
    ↓ submit()
narrative ─┐
history-patch ─┤ 三个并行执行
numeric-sim ─┘
    ↓ 全部完成
next-events
```

### 带 AI 模拟的战斗 Flow 示例

以下示例展示一个完整的战斗回合 Flow：校验动作 → AI 模拟 → 渲染结果。

```json
{
  "version": "1.0",
  "id": "combat-round",
  "name": "战斗回合",
  "description": "校验玩家动作 → AI 世界模拟 → 渲染结果",
  "nodes": [
    {
      "id": "wait-action",
      "kind": "interact",
      "interact": {
        "inputSchema": {
          "type": "object",
          "properties": {
            "action": { "type": "string", "enum": ["attack", "defend", "skill", "item"] }
          },
          "required": ["action"]
        }
      },
      "writes": ["combat.pendingAction"],
      "priority": "interactive"
    },
    {
      "id": "validate-action",
      "kind": "compute",
      "handler": "validateCombatAction",
      "dependsOn": ["wait-action"],
      "priority": "interactive"
    },
    {
      "id": "simulate-action",
      "kind": "compute",
      "handler": "simulateCombatAction",
      "dependsOn": ["validate-action"],
      "writes": ["combat.result"],
      "model": ["deepseek-chat"],
      "priority": "interactive"
    },
    {
      "id": "render-result",
      "kind": "compute",
      "handler": "renderCombatResult",
      "dependsOn": ["simulate-action"],
      "writes": ["scene.narrative"],
      "priority": "interactive"
    }
  ]
}
```

对应的 handler 实现：

```typescript
import { compose, base } from '@kal-ai/core'

const handlers = {
  // 1. 校验玩家动作是否合法（开发者自行实现业务规则校验）
  validateCombatAction: async (ctx) => {
    const combat = ctx.state['combat'] as { pendingAction: string }
    const player = ctx.state['player'] as { hp: number }
    if (player.hp <= 0) {
      throw new Error('动作不合法: 死亡角色无法行动')
    }
    return combat.pendingAction
  },

  // 2. 调用模型执行 AI 模拟
  simulateCombatAction: async (ctx) => {
    const action = ctx.deps['validate-action'] as string
    const worldContext = JSON.stringify({
      player: ctx.state['player'],
      enemy: ctx.state['enemy'],
      scene: ctx.state['scene'],
    })
    const { messages } = compose([
      base('system', '你是一个奇幻RPG的世界模拟器。根据世界状态和玩家动作，描述结果并以 JSON 返回状态变更。', { role: 'system' }),
      base('user', `世界状态：${worldContext}\n动作：${action}`, { role: 'user' }),
    ]).resolve({})
    const response = await ctx.core.model.invoke({
      messages,
      responseFormat: { type: 'json_object' },
    })
    const parsed = JSON.parse(response.content!)
    // 开发者自行将 patches 写回 StateManager
    for (const patch of parsed.patches ?? []) {
      ctx.core.state.set(patch.path, patch.value)
    }
    return parsed
  },

  // 3. 将叙事文本传递给前端渲染
  renderCombatResult: async (ctx) => {
    const simResult = ctx.deps['simulate-action'] as { narrative: string }
    return simResult.narrative
  },
}
```

执行顺序：
```
wait-action（阻断等待玩家选择动作）
    ↓ submit({ actionId: 'attack' })
validate-action（开发者自行校验业务规则：死亡角色不能行动、HP 不能为负等）
    ↓
simulate-action（调用模型，AI 生成叙事 + 状态变更，开发者自行写回 StateManager）
    ↓
render-result（提取叙事文本，写入 scene.narrative）
```

## 七、开发顺序与分工

### Phase 0：类型定义（1 天）
- 完成 `types/` 下所有类型文件
- 完成各模块 `interfaces.ts`

### Phase 1：图构建（2 天，可与 core Phase 1 并行）
| 任务 | 模块 |
|------|------|
| 1A | graph/flow-graph — DAG 构建 + 拓扑排序 |
| 1B | graph/cycle-detector — 环检测（含 SubFlow 引用） |
| 1C | graph/conflict-detector — 写冲突检测 |

### Phase 2：执行引擎（3 天，依赖 core Phase 2 的 Model）
| 任务 | 前置依赖 |
|------|----------|
| 2A executor/scheduler — 优先级队列 + 并发控制 | Phase 1 |
| 2B executor/node-runner — 单节点执行 | core Model |
| 2C executor/flow-executor — 完整执行引擎 | 2A + 2B |

### Phase 3：内置节点 + 序列化（2 天，部分可并行）
| 任务 | 前置依赖 |
|------|----------|
| 3A nodes/interact-node | Phase 2 |
| 3B nodes/timer-node | Phase 2 |
| 3C nodes/subflow-node | Phase 2 + 1B(环检测) |
| 3D serialization — JSON 序列化/反序列化 | Phase 1 |

### Phase 4：集成（1 天）
| 任务 |
|------|
| 4A createFlowExecutor 工厂函数 |
| 4B 集成测试 — 跑通青椒季度推进示例 |
| 4C 导出整理 + 构建配置 |

关键路径：`Phase 0 → 1A(拓扑排序) → 2C(执行引擎) → 4B(集成测试)`

## 八、最小可用链路（MVP）

跑通"定义 3 个节点 → 自动并行 → 收集结果"：

```typescript
import { createKalCore } from '@kal-ai/core'
import { createFlowExecutor } from '@kal-ai/core/flow'

const core = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    }
  },
  state: { initialState: { player: { name: '勇者', hp: 100 } } }
})

const executor = createFlowExecutor({ core })

executor.load({
  id: 'demo',
  nodes: [
    {
      id: 'narrative',
      kind: 'compute',
      run: async (ctx) => {
        const res = await ctx.core.model.invoke({
          messages: [{ role: 'user', content: '描述新手村' }]
        })
        return res.content
      },
      writes: ['scene.narrative'],
    },
    {
      id: 'stats',
      kind: 'compute',
      run: async (ctx) => {
        const res = await ctx.core.model.invoke({
          messages: [{ role: 'user', content: '生成初始属性' }]
        })
        return res.content
      },
      writes: ['player.stats'],
    },
    {
      id: 'summary',
      kind: 'compute',
      run: async (ctx) => `叙事: ${ctx.deps.narrative}, 属性: ${ctx.deps.stats}`,
      dependsOn: ['narrative', 'stats'],
    }
  ]
})

await executor.start()
const result = await executor.get('summary')
console.log(result)
```

## 九、验证方式

1. Phase 0 完成后：`tsc --noEmit` 通过
2. Phase 1 完成后：拓扑排序、环检测、写冲突检测单元测试通过
3. Phase 2 完成后：3 节点并行执行 + 依赖串行执行测试通过
4. Phase 3 完成后：interact 阻断/恢复、timer 触发、SubFlow 嵌套测试通过
5. Phase 4 完成后：青椒季度推进 JSON 加载 → 执行 → 输出完整结果
