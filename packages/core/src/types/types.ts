/**
 * Core type definitions for KAL-AI
 * Merged from: common, handle, message, state, flow, config
 */

// ── Common ──

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// ── Handle ──

export interface HandleDefinition {
  name: string;
  type: string;
  defaultValue?: any;
  required?: boolean;
}

// ── Message ──

export type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ImageUrl {
  url: string;
  alt?: string;
}

// ── State ──

export type StateValueType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface StateValue {
  type: StateValueType;
  value: JsonValue;
}

export interface StateStore {
  [key: string]: StateValue;
}

export type InitialState = StateStore;

// ── Flow ──

export interface Edge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface FlowDefinition {
  schemaVersion?: string;
  inputs?: HandleDefinition[];
  outputs?: HandleDefinition[];
  nodes: NodeDefinition[];
  edges: Edge[];
}

// ── Config ──

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxEntries: number;
}

export interface LLMConfig {
  provider: string;
  apiKey: string;
  defaultModel: string;
  baseUrl?: string;
  retry: RetryConfig;
  cache: CacheConfig;
}

export interface ImageConfig {
  provider: string;
  apiKey: string;
}

export interface EngineConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxConcurrentFlows: number;
  timeout: number;
}

export interface KalConfig {
  name: string;
  version: string;
  engine: EngineConfig;
  llm: LLMConfig;
  image: ImageConfig;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttl: 3600000,
  maxEntries: 1000,
};

// ── Node (forward reference for FlowDefinition) ──

export interface NodeDefinition {
  id: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  config?: Record<string, any>;
  ref?: string;
}
