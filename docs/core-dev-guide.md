# @kal-ai/core 开发文档

## Context

KAL-AI 是面向游戏开发的 AI 框架，用 TypeScript 编写，作为 npm package 发布。本文档细化 `@kal-ai/core` 包的模块划分、接口定义、依赖关系和开发顺序，方便团队分工并行开发。

技术约束：TypeScript 严格类型、bun workspace monorepo、接口先行、浏览器 + Node.js 双端兼容、只需支持 OpenAI 兼容 API。

## 一、模块划分

| 模块 | 职责 | 对外暴露 |
|------|------|----------|
| `types` | 全局共享类型（MMC、消息、模型、工具等） | 类型定义 |
| `model` | 模型调用、Model Factory、OpenAI 兼容 API、流式输出 | ModelFactory, Model |
| `state` | 游戏状态管理、Storage 接口 | StateManager, Storage |
| `prompt` | 函数式 prompt 组合：节点、compose、格式化 | base, field, when, randomSlot, budget, compose |
| `tools` | Tool 注册 + MCP 协议 + function calling 循环 | ToolRegistry, McpClient |
| `safety` | 敏感内容检测与替换 | SafetyFilter |
| `observe` | 计费统计、Token 追踪 | Observer, UsageTracker |
| `infra` | 重试/退避、JSON repair、三层缓存、后处理管道 | RetryPolicy, JsonRepair, CacheManager |

## 二、目录结构

```
packages/core/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # 统一导出
│   ├── kal-core.ts                 # KalCore 入口
│   ├── types/
│   │   ├── index.ts
│   │   ├── mmc.ts                  # Multi Modal Content
│   │   ├── message.ts              # 消息类型（对齐 OpenAI）
│   │   ├── model.ts                # 模型相关类型
│   │   ├── tool.ts                 # Tool / function calling
│   │   ├── errors.ts               # 错误体系
│   │   └── common.ts               # 通用工具类型
│   ├── model/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── model-factory.ts
│   │   ├── openai-compatible.ts
│   │   └── streaming.ts
│   ├── state/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── state-manager.ts
│   │   └── memory-storage.ts
│   ├── prompt/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── nodes.ts                # base, field, when, randomSlot, budget
│   │   ├── compose.ts              # compose, resolve
│   │   └── format.ts               # formatXML, formatMarkdown
│   ├── tools/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── tool-registry.ts
│   │   ├── function-calling.ts
│   │   └── mcp-client.ts
│   ├── safety/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   └── safety-filter.ts
│   ├── observe/
│   │   ├── index.ts
│   │   ├── interfaces.ts
│   │   ├── observer.ts
│   │   └── usage-tracker.ts
│   └── infra/
│       ├── index.ts
│       ├── interfaces.ts
│       ├── retry.ts
│       ├── json-repair.ts
│       ├── cache.ts
│       ├── post-processor.ts
│       └── vector-store.ts         # MemoryVectorStore
└── __tests__/
    ├── model/
    ├── state/
    ├── prompt/
    ├── tools/
    ├── safety/
    ├── observe/
    └── infra/
```

## 三、核心接口定义

### 3.1 types — 全局共享类型

#### types/mmc.ts
```typescript
export type MMCType = 'text' | 'image' | 'audio' | 'video'

export interface MMCBlock {
  readonly type: MMCType
  readonly content: string
  readonly mimeType?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export type MMC = readonly MMCBlock[]

export interface MMCFactory {
  text(content: string): MMCBlock
  image(url: string, mimeType?: string): MMCBlock
  audio(url: string, mimeType?: string): MMCBlock
  video(url: string, mimeType?: string): MMCBlock
}
```

#### types/message.ts
```typescript
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  readonly role: MessageRole
  readonly content: string | null
  readonly mmcBlocks?: MMC
  readonly toolCalls?: readonly ToolCall[]
  readonly toolCallId?: string
  readonly name?: string
}

export interface ToolCall {
  readonly id: string
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly arguments: string
  }
}
```

#### types/model.ts
```typescript
export interface ModelConfig {
  readonly modelId: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly maxTokens?: number
  readonly temperature?: number
  readonly topP?: number
  readonly frequencyPenalty?: number
  readonly presencePenalty?: number
  readonly repetitionPenalty?: number
  readonly topK?: number
  readonly enableThinking?: boolean
  readonly seed?: number
  readonly headers?: Readonly<Record<string, string>>
  readonly timeoutMs?: number
}

export interface ModelRequest {
  readonly messages: readonly ChatMessage[]
  readonly overrides?: Partial<Pick<ModelConfig, 'maxTokens' | 'temperature' | 'topP' | 'frequencyPenalty' | 'presencePenalty' | 'repetitionPenalty' | 'topK' | 'enableThinking' | 'seed'>>
  readonly tools?: readonly ToolDefinition[]
  readonly stream?: boolean
  readonly responseFormat?: ResponseFormat
}

export type ResponseFormat =
  | { readonly type: 'text' }
  | { readonly type: 'json_object' }
  | { readonly type: 'json_schema'; readonly jsonSchema: Record<string, unknown> }

export interface ModelResponse {
  readonly id: string
  readonly content: string | null
  readonly mmcBlocks?: MMC
  readonly toolCalls?: readonly ToolCall[]
  readonly usage: TokenUsage
  readonly finishReason: FinishReason
  readonly raw?: unknown
}

export interface TokenUsage {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly totalTokens: number
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'

export interface StreamChunk {
  readonly id: string
  readonly delta: {
    readonly content?: string
    readonly toolCalls?: readonly Partial<ToolCall>[]
  }
  readonly finishReason?: FinishReason
  readonly usage?: TokenUsage
}
```

#### types/tool.ts
```typescript
export interface ToolDefinition {
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}

export interface ToolContext {
  readonly state: Readonly<Record<string, unknown>>
  readonly modelId: string
  readonly traceId: string
}

export interface ToolResult {
  readonly toolCallId: string
  readonly content: string
  readonly isError?: boolean
}
```

#### types/common.ts
```typescript
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export interface Disposable {
  dispose(): void | Promise<void>
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void
}
```

#### types/errors.ts
```typescript
export class KalError extends Error {
  constructor(message: string, readonly code: string, readonly cause?: unknown) {
    super(message)
    this.name = 'KalError'
  }
}

export class ModelError extends KalError {
  constructor(message: string, readonly statusCode?: number,
    readonly retryable: boolean = false, cause?: unknown) {
    super(message, 'MODEL_ERROR', cause)
    this.name = 'ModelError'
  }
}

export class StateError extends KalError {
  constructor(message: string, cause?: unknown) {
    super(message, 'STATE_ERROR', cause)
    this.name = 'StateError'
  }
}

export class ToolError extends KalError {
  constructor(message: string, readonly toolName: string, cause?: unknown) {
    super(message, 'TOOL_ERROR', cause)
    this.name = 'ToolError'
  }
}
```

### 3.2 model — 模型调用

```typescript
// model/interfaces.ts

/** 模型调用接口 */
export interface Model {
  readonly config: ModelConfig
  invoke(request: ModelRequest): Promise<ModelResponse>
  stream(request: ModelRequest): AsyncIterable<StreamChunk>
}

/** 模型工厂 — 管理多个模型实例 */
export interface ModelFactory {
  register(name: string, config: ModelConfig): void
  get(name: string): Model
  getDefault(): Model
  setDefault(name: string): void
  list(): readonly string[]
}

/** 模型调用中间件（infra/safety/observe 通过此机制注入） */
export type ModelMiddleware = (
  request: ModelRequest,
  next: (request: ModelRequest) => Promise<ModelResponse>
) => Promise<ModelResponse>

export interface ModelFactoryOptions {
  readonly middlewares?: readonly ModelMiddleware[]
  readonly logger?: Logger
}
```

### 3.3 state — 状态管理

```typescript
// state/interfaces.ts

export interface StatePatch {
  readonly path: string
  readonly op: 'set' | 'delete' | 'merge'
  readonly value?: unknown
}

export interface StateChangeEvent {
  readonly patches: readonly StatePatch[]
  readonly prevState: Readonly<Record<string, unknown>>
  readonly nextState: Readonly<Record<string, unknown>>
  readonly timestamp: number
}

export interface StateManager {
  getSnapshot(): Readonly<Record<string, unknown>>
  get<T = unknown>(path: string): T | undefined
  set(path: string, value: unknown): void
  applyPatches(patches: readonly StatePatch[]): void
  merge(path: string, partial: Record<string, unknown>): void
  delete(path: string): void
  subscribe(listener: (event: StateChangeEvent) => void): () => void
  reset(initialState?: Record<string, unknown>): void
  getHistory(): readonly StateChangeEvent[]
  /** 获取 State Schema（如果初始化时提供了，schema 不可变） */
  getSchema(): StateSchema | undefined
  /**
   * 获取所有合法路径（供编辑器自动补全）。
   * 有 schema 时返回 schema 中定义的路径；无 schema 时返回当前 state 的所有叶子路径。
   */
  getPaths(): readonly string[]
  /**
   * 根据 Schema 校验当前状态（可选，不影响运行时写入）。
   * 无 schema 时返回空数组。
   */
  validateState(): readonly StateValidationError[]
}

export interface StateValidationError {
  readonly path: string
  readonly message: string
  readonly expected?: string
  readonly actual?: string
}

/** 持久化存储接口（预留扩展） */
export interface Storage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  keys(): Promise<readonly string[]>
}

export interface StateManagerOptions {
  readonly initialState?: Record<string, unknown>
  readonly storage?: Storage
  readonly enableHistory?: boolean
  readonly maxHistorySize?: number
  /** 可选的 State Schema 定义（供编辑器做路径自动补全和校验） */
  readonly schema?: StateSchema
}

/**
 * State Schema — 描述游戏状态的结构
 *
 * 可选功能，主要服务于可视化编辑器：
 * - 编辑器属性面板中 writes/state-ref 端口的路径自动补全
 * - 节点 writes 字段的合法性校验
 * - 编辑器 State 面板的结构化展示
 *
 * 运行时 StateManager 不强制校验（保持灵活性），
 * 但如果提供了 schema，可通过 validateState() 做可选校验。
 */
export interface StateSchema {
  /** 顶层字段定义 */
  readonly fields: readonly StateFieldDefinition[]
}

export interface StateFieldDefinition {
  /** 字段路径（如 'player', 'player.hp', 'scene.narrative'） */
  readonly path: string
  /** 字段类型 */
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  /** 字段描述（编辑器 tooltip） */
  readonly description?: string
  /** 子字段（type 为 object 时） */
  readonly children?: readonly StateFieldDefinition[]
  /** 默认值 */
  readonly defaultValue?: unknown
  /** 数值范围（type 为 number 时） */
  readonly min?: number
  readonly max?: number
}
```

### 3.4 prompt — 提示词构建

函数式 composer，从 Game State 到 LLM 输入的完整管线。核心概念是 `PromptNode`——可组合的 prompt 片段，通过 `compose` 组装后调用 `resolve(state)` 生成最终消息列表。

```typescript
// prompt/interfaces.ts

// ======== 核心节点类型 ========

export type PromptNodeRole = 'system' | 'user' | 'assistant'

/** 所有 prompt 片段的基类 */
export interface PromptNode {
  readonly id: string
  readonly role?: PromptNodeRole
  /** 估算 token 数（字符数 / 4 近似） */
  estimateTokens(state: Readonly<Record<string, unknown>>): number
  /** 解析为消息内容字符串（budget 不足时返回 null） */
  resolve(state: Readonly<Record<string, unknown>>): string | null
}

// ======== 基础节点 ========

export interface BaseNodeOptions {
  readonly role?: PromptNodeRole
}

/** 静态文本节点 */
export function base(id: string, content: string, options?: BaseNodeOptions): PromptNode

// ======== 字段节点 — 从 State 提取动态内容 ========

export interface FieldOptions<T = unknown> {
  /** 从 state 提取原始数据 */
  readonly source: (state: Readonly<Record<string, unknown>>) => T[]
  /** 滑动窗口：取最近 N 条 */
  readonly window?: number
  /** 采样：从窗口中取 N 条 */
  readonly sample?: number
  /** 排序权重（值越大越优先保留） */
  readonly score?: (item: T) => number
  /** 去重字段 */
  readonly dedup?: readonly (keyof T & string)[]
  /** 将数据序列化为字符串 */
  readonly describe: (items: T[]) => string
  readonly role?: PromptNodeRole
}

/** 从 state 提取字段，支持窗口、采样、排序、去重 */
export function field<T = unknown>(id: string, options: FieldOptions<T>): PromptNode

// ======== 条件节点 ========

/** 根据 state 条件决定是否包含子节点 */
export function when(
  id: string,
  condition: (state: Readonly<Record<string, unknown>>) => boolean,
  nodes: readonly PromptNode[],
  elseNodes?: readonly PromptNode[]
): PromptNode

// ======== 随机插槽 ========

export interface RandomSlotOptions {
  /** 随机种子（固定则每次结果相同，方便测试） */
  readonly seed?: number
}

/** 从候选节点中随机选一个 */
export function randomSlot(
  id: string,
  candidates: readonly PromptNode[],
  options?: RandomSlotOptions
): PromptNode

// ======== Token 预算 ========

export interface BudgetOptions {
  /** token 上限（字符数 / 4 近似） */
  readonly maxTokens: number
  /**
   * 超出预算时的裁剪策略：
   * - 'tail'：从末尾丢弃（默认）
   * - 'weighted'：按节点权重比例裁剪
   */
  readonly strategy?: 'tail' | 'weighted'
  /** 各节点权重（strategy='weighted' 时生效，key 为节点 id） */
  readonly weights?: Readonly<Record<string, number>>
}

/** 包裹节点列表，超出预算时自动裁剪 */
export function budget(nodes: readonly PromptNode[], options: BudgetOptions): PromptNode

// ======== 组合与解析 ========

export interface ResolvedPrompt {
  readonly messages: readonly ChatMessage[]
  /** 各节点解析结果（用于调试） */
  readonly nodeResults: Readonly<Record<string, string | null>>
  /** 总估算 token 数 */
  readonly estimatedTokens: number
}

/** 将节点列表组合为可解析的 prompt */
export function compose(nodes: readonly PromptNode[]): {
  resolve(state: Readonly<Record<string, unknown>>): ResolvedPrompt
}

// ======== 格式化输出 ========

/** 将 ResolvedPrompt 格式化为 XML 风格的系统消息 */
export function formatXML(resolved: ResolvedPrompt): readonly ChatMessage[]

/** 将 ResolvedPrompt 格式化为 Markdown 风格的系统消息 */
export function formatMarkdown(resolved: ResolvedPrompt): readonly ChatMessage[]

```

**使用示例：**

```typescript
import { base, field, when, randomSlot, budget, compose, formatXML } from '@kal-ai/core'

const prompt = compose([
  base('intro', '你是一个中世纪叙事 AI', { role: 'system' }),

  field('history', {
    source: state => state.get('events') as Array<{ eventId: string; text: string; importance: number }>,
    window: 10,
    sample: 5,
    score: item => item.importance,
    dedup: ['eventId'],
    describe: events => events.map(e => e.text).join('\n'),
  }),

  when('combat', state => Boolean(state.get('inCombat')), [
    base('rules', '战斗规则：先攻方造成双倍伤害'),
  ]),

  randomSlot('flavor', [
    base('f1', '今天天气晴朗'),
    base('f2', '远处传来狼嚎'),
    base('f3', '营地篝火噼啪作响'),
  ], { seed: 42 }),

  budget([
    field('npc_memory', {
      source: state => state.get('npcs') as Array<{ npcId: string; memory: string }>,
      window: 20,
      sample: 5,
      describe: npcs => npcs.map(n => n.memory).join('\n'),
    }),
  ], { maxTokens: 800, strategy: 'weighted', weights: { npc_memory: 1 } }),
])

const resolved = prompt.resolve(state.getSnapshot())
const messages = formatXML(resolved)
const response = await model.invoke({ messages })
```

### 3.5 tools — Tools 与 MCP

```typescript
// tools/interfaces.ts

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<string | Record<string, unknown>>

export interface ToolRegistry {
  register(definition: ToolDefinition, handler: ToolHandler): void
  unregister(name: string): void
  getDefinitions(): readonly ToolDefinition[]
  execute(toolCall: ToolCall, context: ToolContext): Promise<ToolResult>
  executeAll(toolCalls: readonly ToolCall[], context: ToolContext): Promise<readonly ToolResult[]>
  has(name: string): boolean
}

export type McpTransport =
  | { readonly type: 'stdio'; readonly command: string; readonly args?: readonly string[] }
  | { readonly type: 'sse'; readonly url: string; readonly headers?: Record<string, string> }
  | { readonly type: 'streamable-http'; readonly url: string; readonly headers?: Record<string, string> }

export interface McpClient extends Disposable {
  connect(): Promise<void>
  listTools(): Promise<readonly ToolDefinition[]>
  callTool(name: string, args: Record<string, unknown>): Promise<string>
  disconnect(): Promise<void>
  readonly connected: boolean
}

export interface McpBridge {
  bridge(client: McpClient, registry: ToolRegistry): Promise<Disposable>
}

/** MCP 客户端配置 */
export interface McpClientConfig {
  readonly transport: McpTransport
  readonly name?: string
  readonly autoReconnect?: boolean
  readonly timeoutMs?: number
}

/** Function Calling 执行循环 */
export interface FunctionCallingLoop {
  run(options: FunctionCallingOptions): Promise<FunctionCallingResult>
}

export interface FunctionCallingOptions {
  readonly model: Model
  readonly messages: readonly ChatMessage[]
  readonly registry: ToolRegistry
  readonly context: ToolContext
  readonly maxRounds?: number
  readonly onRound?: (round: FunctionCallingRound) => void
}

export interface FunctionCallingRound {
  readonly roundIndex: number
  readonly toolCalls: readonly ToolCall[]
  readonly toolResults: readonly ToolResult[]
}

export interface FunctionCallingResult {
  readonly finalResponse: ModelResponse
  readonly rounds: readonly FunctionCallingRound[]
  readonly totalUsage: TokenUsage
}
```

### 3.6 safety — 内容安全

```typescript
// safety/interfaces.ts

export interface SafetyCheckResult {
  readonly safe: boolean
  readonly violations: readonly SafetyViolation[]
  readonly sanitizedContent: string
}

export interface SafetyViolation {
  readonly ruleId: string
  readonly category: SafetyCategory
  readonly severity: 'low' | 'medium' | 'high' | 'critical'
  readonly matchedText: string
  readonly replacement?: string
  readonly message: string
}

export type SafetyCategory =
  | 'profanity' | 'violence' | 'sexual'
  | 'hate_speech' | 'personal_info' | 'custom'

export interface SafetyRule {
  readonly id: string
  readonly category: SafetyCategory
  readonly severity: SafetyViolation['severity']
  readonly pattern: RegExp | readonly string[]
  readonly replacement?: string
  readonly description?: string
}

export interface SafetyFilter {
  addRule(rule: SafetyRule): void
  addRules(rules: readonly SafetyRule[]): void
  removeRule(ruleId: string): void
  check(content: string): SafetyCheckResult
  sanitize(content: string): string
  asMiddleware(): ModelMiddleware
}
```

### 3.7 observe — 可观测性

```typescript
// observe/interfaces.ts

export interface UsageRecord {
  readonly id: string
  readonly modelId: string
  readonly timestamp: number
  readonly usage: TokenUsage
  readonly estimatedCost: number
  readonly latencyMs: number
  readonly cached: boolean
  readonly traceId?: string
  readonly tags?: Readonly<Record<string, string>>
}

export interface PricingConfig {
  readonly modelId: string
  readonly promptPricePerMillion: number
  readonly completionPricePerMillion: number
}

export interface UsageSummary {
  readonly totalRequests: number
  readonly totalPromptTokens: number
  readonly totalCompletionTokens: number
  readonly totalTokens: number
  readonly totalEstimatedCost: number
  readonly averageLatencyMs: number
  readonly cacheHitRate: number
  readonly byModel: Readonly<Record<string, Omit<UsageSummary, 'byModel'>>>
}

export interface UsageTracker {
  record(record: UsageRecord): void
  getRecords(filter?: UsageFilter): readonly UsageRecord[]
  getSummary(filter?: UsageFilter): UsageSummary
  clear(): void
  export(): string
}

export interface UsageFilter {
  readonly modelId?: string
  readonly startTime?: number
  readonly endTime?: number
  readonly traceId?: string
}

export interface Observer {
  setPricing(configs: readonly PricingConfig[]): void
  readonly tracker: UsageTracker
  asMiddleware(): ModelMiddleware
  onUsage(listener: (record: UsageRecord) => void): () => void
}
```

### 3.8 infra — 基础设施

```typescript
// infra/interfaces.ts

// ---- 重试 ----
export interface RetryOptions {
  readonly maxRetries?: number        // 默认 3
  readonly initialDelayMs?: number    // 默认 1000
  readonly maxDelayMs?: number        // 默认 30000
  readonly backoffMultiplier?: number // 默认 2
  readonly jitter?: boolean           // 默认 true
  readonly retryableError?: (error: unknown) => boolean
  readonly onRetry?: (attempt: number, error: unknown, delayMs: number) => void
}

export interface RetryPolicy {
  wrap<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>
  asMiddleware(options?: RetryOptions): ModelMiddleware
}

// ---- JSON Repair ----
export interface JsonRepairOptions {
  readonly extractFromCodeBlock?: boolean
  readonly fixCommonErrors?: boolean
  readonly fixTruncated?: boolean
}

export interface JsonRepair {
  parse<T = unknown>(input: string, options?: JsonRepairOptions): T
  repair(input: string, options?: JsonRepairOptions): string
  asPostProcessor(): PostProcessor
}

// ---- 后处理 ----
export interface PostProcessor {
  readonly name: string
  process(content: string): string | Promise<string>
}

export interface PostProcessorPipeline {
  add(processor: PostProcessor): void
  remove(name: string): void
  process(content: string): Promise<string>
  asMiddleware(): ModelMiddleware
}

// ---- 三层缓存 ----
// L1: 内存（Map，最快）  L2: 持久化（Storage）  L3: 语义缓存（embedding，可选）

export interface CacheEntry<T = unknown> {
  readonly key: string
  readonly value: T
  readonly createdAt: number
  readonly expiresAt?: number
  readonly hits: number
}

export interface CacheLayer<T = unknown> {
  readonly name: string
  get(key: string): Promise<CacheEntry<T> | null>
  set(key: string, value: T, ttlMs?: number): Promise<void>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
  clear(): Promise<void>
  size(): Promise<number>
}

export interface CacheKeyStrategy {
  generate(modelId: string, messages: readonly ChatMessage[], overrides?: Record<string, unknown>): string
}

export interface CacheManager {
  readonly l1: CacheLayer
  readonly l2?: CacheLayer
  readonly l3?: CacheLayer
  get<T = unknown>(key: string): Promise<CacheHitResult<T> | null>
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  getStats(): CacheStats
  asMiddleware(keyStrategy?: CacheKeyStrategy): ModelMiddleware
}

export interface CacheHitResult<T = unknown> {
  readonly value: T
  readonly layer: 'l1' | 'l2' | 'l3'
}

export interface CacheStats {
  readonly l1Hits: number
  readonly l2Hits: number
  readonly l3Hits: number
  readonly misses: number
  readonly totalRequests: number
  readonly hitRate: number
}

export interface CacheManagerOptions {
  readonly l1MaxEntries?: number      // 默认 100
  readonly l1DefaultTtlMs?: number    // 默认 5 分钟
  readonly l2Storage?: Storage
  readonly l2DefaultTtlMs?: number    // 默认 1 小时
  readonly l3Config?: SemanticCacheConfig
}

export interface SemanticCacheConfig {
  readonly embeddingModel: Model
  readonly similarityThreshold?: number  // 默认 0.95
  readonly maxEntries?: number
}

// ---- 向量存储（用于语义采样、语义缓存） ----

export interface VectorEntry {
  readonly id: string
  readonly embedding: readonly number[]
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface VectorSearchResult {
  readonly id: string
  readonly similarity: number
  readonly metadata?: Readonly<Record<string, unknown>>
}

/**
 * 内存向量存储（简单实现，用于 prompt 语义采样和 L3 语义缓存）。
 *
 * 算法规格：
 * - 相似度：余弦相似度（cosine similarity），范围 [-1, 1]
 * - search() 返回相似度 ≥ threshold（默认 0）的结果，按相似度降序排列，最多返回 k 个
 * - 所有向量必须维度相同，add() 时不校验维度（调用方保证一致性）
 * - 时间复杂度：search() 为 O(n * d)，n 为向量数，d 为维度；适合 n < 10000 的场景
 */
export interface MemoryVectorStore {
  /** 添加向量 */
  add(entry: VectorEntry): void
  /** 批量添加 */
  addBatch(entries: readonly VectorEntry[]): void
  /** 查询最相似的 k 个向量 */
  search(query: readonly number[], k: number, threshold?: number): readonly VectorSearchResult[]
  /** 删除向量 */
  delete(id: string): void
  /** 清空 */
  clear(): void
  /** 当前向量数 */
  size(): number
}

export function createMemoryVectorStore(): MemoryVectorStore
```

### 3.9 KalCore — 统一入口

```typescript
// kal-core.ts

export interface KalCoreOptions {
  readonly models: Readonly<Record<string, ModelConfig>>
  readonly defaultModel?: string
  readonly state?: StateManagerOptions
  readonly retry?: RetryOptions
  readonly cache?: CacheManagerOptions
  readonly safetyRules?: readonly SafetyRule[]
  readonly pricing?: readonly PricingConfig[]
  readonly middlewares?: readonly ModelMiddleware[]
  readonly logger?: Logger
}

export interface KalCore {
  readonly modelFactory: ModelFactory
  readonly model: Model
  readonly state: StateManager
  readonly tools: ToolRegistry
  readonly safety: SafetyFilter
  readonly observer: Observer
  readonly cache: CacheManager
  readonly jsonRepair: JsonRepair
  readonly mmc: MMCFactory

  /** 一站式调用：构建 prompt → 调用模型 → 可选更新状态 */
  invoke(options: KalInvokeOptions): Promise<KalInvokeResult>
  stream(options: KalInvokeOptions): AsyncIterable<StreamChunk>
  /** 带 function calling 的完整调用循环 */
  runWithTools(options: KalToolRunOptions): Promise<KalToolRunResult>
  connectMcp(config: McpClientConfig): Promise<Disposable>
  dispose(): Promise<void>
}

export interface KalInvokeOptions {
  readonly messages: readonly ChatMessage[]
  readonly model?: string
  readonly overrides?: Partial<Pick<ModelConfig, 'maxTokens' | 'temperature' | 'topP' | 'frequencyPenalty' | 'presencePenalty' | 'repetitionPenalty' | 'topK' | 'enableThinking' | 'seed'>>
  readonly responseFormat?: ResponseFormat
  readonly saveToState?: string
  readonly tags?: Readonly<Record<string, string>>
}

export interface KalInvokeResult {
  readonly response: ModelResponse
  readonly stateSnapshot?: Readonly<Record<string, unknown>>
}

export interface KalToolRunOptions extends KalInvokeOptions {
  readonly maxRounds?: number
  readonly onRound?: (round: FunctionCallingRound) => void
}

export interface KalToolRunResult extends KalInvokeResult {
  readonly rounds: readonly FunctionCallingRound[]
  readonly totalUsage: TokenUsage
}

export function createKalCore(options: KalCoreOptions): KalCore
```

中间件链执行顺序（createKalCore 内部自动组装）：
```
请求 → Observer(before) → Cache(lookup) → Retry(wrap) → Safety(input)
     → 用户自定义中间件 → HTTP调用 → Safety(output) → PostProcess(JSON repair)
     → Cache(store) → Observer(after) → 返回响应
```

## 四、模块间依赖关系

```
┌──────────────────────────────────────────────────┐
│                  @kal-ai/core                    │
│                                                  │
│  types ◄── 所有模块都依赖                         │
│    ▲                                             │
│  infra ◄── 仅依赖 types                          │
│    ▲                                             │
│  model ── 依赖 types + infra                     │
│    ▲                                             │
│  state ── 依赖 types（弱依赖 infra 的 Storage）   │
│  prompt ── 依赖 types + state（field/when 直接读 state）│
│  tools ── 依赖 types + model                     │
│  safety ── 依赖 types（通过 ModelMiddleware 注入） │
│  observe ── 依赖 types（通过 ModelMiddleware 注入）│
│                                                  │
│  KalCore ── 组装全部模块                          │
└──────────────────────────────────────────────────┘
```

关键设计：model 通过 `ModelMiddleware` 定义中间件链，infra/safety/observe 通过 `asMiddleware()` 注入，运行时可选，编译时不硬依赖。

**与 @kal-ai/core/flow 的集成点：**

flow 模块通过 `KalCore` 获取 core 的能力，不直接依赖 core 的内部模块：

| flow 需要 | 通过 core 的哪个接口 |
|-----------------|-------------------|
| 调用大模型 | `KalCore.model`（或 `modelFactory.get(name)`） |
| 读写游戏状态 | `KalCore.state` |
| 注册/调用 Tools | `KalCore.tools` |
| 构建 prompt | `compose()`/`base()`/`field()` 等函数式 API（直接 import） |
| 缓存模型响应 | `KalCore.cache`（通过 middleware 自动生效） |

节点 handler 通过 `NodeContext.core` 访问上述能力，框架不限制 handler 内部的调用方式。

## 五、开发顺序与分工

### Phase 0：接口定义（1-2 天，1 人主导 + 全员评审）
- 完成所有模块的 `interfaces.ts` + `types/` 下全部类型文件
- 产出 `package.json` + `tsconfig.json` 基础配置
- 单元测试骨架

### Phase 1：基础层（3 天，全部可并行）
| 任务 | 模块 | 建议人力 |
|------|------|----------|
| 1A | types — MMC 工厂函数 | 0.5 人 |
| 1B | infra/retry — 重试 + 指数退避 | 1 人 |
| 1C | infra/json-repair — JSON 修复 | 1 人 |
| 1D | infra/cache — L1 内存缓存 | 1 人 |
| 1E | infra/post-processor — 后处理管道 | 0.5 人 |
| 1F | state — StateManager 内存实现 | 1 人 |
| 1G | prompt — nodes + compose + format | 1 人 |
| 1H | infra/vector-store — MemoryVectorStore | 0.5 人 |

### Phase 2：核心能力层（4 天，部分并行）
| 任务 | 模块 | 前置依赖 |
|------|------|----------|
| 2A | model — OpenAI 兼容 API 调用 | 1B(retry) |
| 2B | model — 流式输出 | 2A |
| 2C | model — ModelFactory + 中间件链 | 2A |
| 2D | tools — ToolRegistry | Phase 0（可与 2A 并行） |
| 2E | tools — FunctionCallingLoop | 2A + 2D |
| 2F | infra/cache — L2 持久化缓存 | 1D |

### Phase 3：增强层（3 天，全部可并行）
| 任务 | 模块 | 前置依赖 |
|------|------|----------|
| 3A | safety — SafetyFilter | Phase 0 |
| 3B | observe — Observer + UsageTracker | Phase 0 |
| 3C | tools/mcp — MCP 客户端 + 桥接 | 2D |
| 3D | infra/cache — L3 语义缓存 | 2A + 1D |

### Phase 4：集成（2 天）
| 任务 | 模块 |
|------|------|
| 4A | KalCore 入口类 — 组装所有模块 |
| 4B | 集成测试 — 最小可用链路 |
| 4C | 导出整理 — index.ts barrel exports |
| 4D | 构建配置 — dual ESM/CJS 输出（tsup） |

关键路径：`Phase 0 → 1B(retry) → 2A(model) → 2E(function calling) → 4A(KalCore)`

### 人力分配建议（3 人）
| 开发者 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|---------|---------|---------|---------|
| A（核心） | infra/retry + cache | model 全部 | cache L3 | KalCore 入口 |
| B | state + prompt | tools | MCP 客户端 | 集成测试 |
| C | json-repair + post-processor | cache L2 | safety + observe | 构建配置 |

## 六、最小可用链路（MVP）

跑通 "调用模型 → 更新状态" 只需：`types → infra(retry) → model → state`

```typescript
import { createKalCore } from '@kal-ai/core'

const kal = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    }
  },
  state: {
    initialState: {
      player: { name: '勇者', hp: 100, level: 1 },
      scene: { location: '新手村', description: '' }
    }
  }
})

// 构建 prompt → 调用模型 → 更新状态
import { base, field, compose } from '@kal-ai/core'

const prompt = compose([
  base('system', '你是一个奇幻RPG的叙事AI。', { role: 'system' }),
  field('player', {
    source: state => [state.get('player')],
    describe: ([player]) => `玩家状态: ${JSON.stringify(player)}，描述新手村。`,
    role: 'user',
  }),
])

const { messages } = prompt.resolve(kal.state.getSnapshot())
const response = await kal.model.invoke({ messages })
kal.state.set('scene.description', response.content)
```

## 七、浏览器兼容性策略

| 能力 | Node.js | 浏览器 | 策略 |
|------|---------|--------|------|
| HTTP 请求 | 内置 fetch | fetch API | 统一用 `fetch`（Node 18+） |
| MCP stdio | child_process | 不可用 | 运行时检测，浏览器仅支持 SSE/HTTP |
| Storage L2 | fs | localStorage/IndexedDB | 通过 Storage 接口抽象 |
| crypto | crypto.createHash | SubtleCrypto | 统一 hash 工具函数 |

核心原则：`src/` 中不直接 import Node.js 内置模块，平台特定能力通过接口注入。

### 7.1 纯前端场景的 API Key 安全

浏览器端直接使用 `@kal-ai/core` 时，API Key 不能硬编码在前端代码中。推荐以下方案：

**方案 A：后端代理（推荐，生产环境）**

前端不直接调用大模型 API，而是通过自己的后端代理转发。KAL 的 `ModelConfig.baseUrl` 指向自己的后端：

```typescript
// 前端
const core = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: '/api/ai-proxy',  // 指向自己的后端
      apiKey: '',                 // 后端自动注入，前端无需传
    }
  }
})

// 后端（Express 示例）
app.post('/api/ai-proxy/chat/completions', (req, res) => {
  // 后端持有真实 API Key，转发请求
  fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req.body),
  }).then(r => r.body.pipeTo(res))
})
```

**方案 B：用户自填 Key（开发/Demo 场景）**

适用于黑客松、Demo 展示等场景，让用户在 UI 中输入自己的 API Key：

```typescript
const apiKey = prompt('请输入你的 DeepSeek API Key:')
const core = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey,
    }
  }
})
```

**方案 C：平台托管（未来）**

KAL 平台提供托管服务，开发者使用平台分发的临时 token 调用，无需暴露原始 API Key。此方案属于平台层，不在框架范围内。

| 方案 | 安全性 | 适用场景 |
|------|--------|----------|
| A 后端代理 | 高 | 生产环境、多人游戏 |
| B 用户自填 | 中 | 黑客松、Demo、单机游戏 |
| C 平台托管 | 高 | 未来平台服务 |

## 八、构建输出

```json
{
  "name": "@kal-ai/core",
  "type": "module",
  "main": "./dist/cjs/index.cjs",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs",
      "types": "./dist/types/index.d.ts"
    }
  },
  "sideEffects": false
}
```

使用 `tsup` 构建，同时输出 ESM 和 CJS。

## 九、工厂函数汇总

除 `createKalCore()` 外，各模块对外暴露的工厂函数签名如下。大部分模块由 `createKalCore` 内部组装，但也支持独立使用。

```typescript
// ---- model ----
export function createModelFactory(options?: ModelFactoryOptions): ModelFactory

// ---- state ----
export function createStateManager(options?: StateManagerOptions): StateManager

// ---- prompt（函数式，直接从模块导入，无工厂函数） ----
// base, field, when, randomSlot, budget, compose, formatXML, formatMarkdown

// ---- tools ----
export function createToolRegistry(): ToolRegistry
export function createMcpClient(config: McpClientConfig): McpClient
export function createMcpBridge(): McpBridge
export function createFunctionCallingLoop(): FunctionCallingLoop

// ---- safety ----
export function createSafetyFilter(rules?: readonly SafetyRule[]): SafetyFilter

// ---- observe ----
export function createObserver(pricing?: readonly PricingConfig[]): Observer

// ---- infra ----
export function createRetryPolicy(options?: RetryOptions): RetryPolicy
export function createJsonRepair(options?: JsonRepairOptions): JsonRepair
export function createPostProcessorPipeline(): PostProcessorPipeline
export function createCacheManager(options?: CacheManagerOptions): CacheManager
export function createMemoryVectorStore(): MemoryVectorStore

// ---- MMC ----
/**
 * 返回 MMCFactory 实例，提供 text/image/audio/video 四个工厂方法。
 * KalCore 已内置（通过 kal.mmc 访问），独立使用时调用此函数。
 *
 * const mmc = createMMCFactory()
 * const block = mmc.text('hello')  // MMCBlock { type: 'text', content: 'hello' }
 */
export function createMMCFactory(): MMCFactory
```

> 说明：`UsageTracker` 通过 `Observer.tracker` 获取，不单独暴露工厂函数。`MemoryStorage` 是 `Storage` 接口的内置实现，作为 `createStateManager()` 的默认 storage，也可单独导出：`export class MemoryStorage implements Storage`。

## 十、验证方式

1. Phase 0 完成后：`tsc --noEmit` 通过，所有接口类型无编译错误
2. Phase 1 完成后：各模块单元测试通过（vitest）
3. Phase 2 完成后：MVP 链路跑通（调用真实 API → 获取响应 → 更新状态）
4. Phase 4 完成后：`tsup` 构建成功，ESM/CJS 双格式输出，集成测试通过

### 测试策略

**单元测试（vitest）**

```typescript
// 模型调用 mock — 避免真实 API 调用
import { vi } from 'vitest'

const mockModel = {
  config: { modelId: 'mock', baseUrl: '', apiKey: '' },
  invoke: vi.fn().mockResolvedValue({
    id: 'mock-1',
    content: '{"narrative":"勇者出发了","patches":[]}',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    finishReason: 'stop',
  }),
  stream: vi.fn(),
} satisfies Model

// StateManager 直接实例化，无需 mock
const state = createStateManager({ initialState: { player: { hp: 100 } } })
```

**集成测试（真实 API，CI 可选跳过）**

```typescript
// 通过环境变量控制是否跑真实 API 测试
const runIntegration = process.env.KAL_INTEGRATION_TEST === '1'

describe.skipIf(!runIntegration)('integration', () => {
  it('MVP 链路', async () => {
    const kal = createKalCore({
      models: { default: { modelId: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: process.env.DEEPSEEK_API_KEY! } },
    })
    const { messages } = compose([
      base('sys', '回复 OK', { role: 'system' }),
    ]).resolve({})
    const res = await kal.model.invoke({ messages })
    expect(res.content).toBeTruthy()
  })
})
```

**浏览器兼容性测试**

使用 `@vitest/browser`（基于 Playwright）在真实浏览器环境中运行 core 的单元测试，确保无 Node.js 特定 API 泄漏：

```bash
# 在 packages/core/package.json 中添加
"test:browser": "vitest run --browser.enabled --browser.name=chromium"
```
