/**
 * Node types
 */

import type { HandleDefinition, ChatMessage, TokenUsage, StateValue, RetryConfig, CacheConfig, NodeDefinition } from './types';
import type { ReasoningConfig } from '../llm/llm-client';

export type { NodeDefinition };

/**
 * Node manifest (for UI)
 */
export interface NodeManifest {
  type: string;
  label: string;
  category?: string;
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  configSchema?: Record<string, any>; // JSON Schema
  defaultConfig?: Record<string, any>;
}

/**
 * Node context (provided to custom nodes)
 */
export interface NodeContext {
  // State access
  state: {
    get(key: string): StateValue | undefined;
    set(key: string, value: StateValue): void;
    delete(key: string): void;
    append(key: string, value: any): void;
    appendMany(key: string, values: any[]): void;
  };

  // LLM access
  llm: {
    invoke(
      messages: ChatMessage[],
      options?: LLMOptions
    ): Promise<LLMResponse>;
  };

  // Flow execution (for SubFlow nodes)
  flow?: {
    execute(flowRef: string, inputs: Record<string, any>): Promise<Record<string, any>>;
  };

  // Logger
  logger: {
    debug(message: string, meta?: object): void;
    info(message: string, meta?: object): void;
    warn(message: string, meta?: object): void;
    error(message: string, meta?: object): void;
  };

  // Execution context
  executionId: string;
  nodeId: string;
}

/**
 * LLM invocation options
 */
export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  retry?: Partial<RetryConfig>;
  cache?: Partial<CacheConfig>;
  responseFormat?: 'text' | 'json';
  jsonSchema?: object;
  reasoning?: ReasoningConfig;
}

/**
 * LLM response
 */
export interface LLMResponse {
  text: string;
  usage: TokenUsage;
  cached?: boolean;
}

/**
 * Custom node interface
 */
export interface CustomNode {
  type: string;
  label: string;
  category?: string;
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  configSchema?: Record<string, any>;
  defaultConfig?: Record<string, any>;
  execute(
    inputs: Record<string, any>,
    config: Record<string, any>,
    context: NodeContext
  ): Promise<Record<string, any>>;
}
