/**
 * Hook types for engine lifecycle events
 */

import type { NodeExecutionError } from './errors';
import type { ChatMessage, TokenUsage } from './types';

/**
 * Flow start event
 */
export interface FlowStartEvent {
  executionId: string;
  flowId: string;
  timestamp: number;
}

/**
 * Flow end event
 */
export interface FlowEndEvent {
  executionId: string;
  flowId: string;
  timestamp: number;
  durationMs: number;
}

/**
 * Flow error event
 */
export interface FlowErrorEvent {
  executionId: string;
  flowId: string;
  error: NodeExecutionError;
  timestamp: number;
}

/**
 * Node start event
 */
export interface NodeStartEvent {
  executionId: string;
  nodeId: string;
  nodeType: string;
  inputs: Record<string, any>;
  timestamp: number;
}

/**
 * Node end event
 */
export interface NodeEndEvent {
  executionId: string;
  nodeId: string;
  nodeType: string;
  outputs: Record<string, any>;
  durationMs: number;
  timestamp: number;
  warnings?: string[];
}

/**
 * Node error event
 */
export interface NodeErrorEvent {
  executionId: string;
  nodeId: string;
  nodeType: string;
  error: NodeExecutionError;
  timestamp: number;
}

/**
 * LLM request event
 */
export interface LLMRequestEvent {
  executionId: string;
  nodeId: string;
  model: string;
  messages: ChatMessage[];
  timestamp: number;
}

/**
 * LLM response event
 */
export interface LLMResponseEvent {
  executionId: string;
  nodeId: string;
  model: string;
  text: string;
  usage: TokenUsage;
  latencyMs: number;
  cached: boolean;
  timestamp: number;
}

/**
 * Engine hooks
 */
export interface EngineHooks {
  // Flow level
  onFlowStart?: (event: FlowStartEvent) => void | Promise<void>;
  onFlowEnd?: (event: FlowEndEvent) => void | Promise<void>;
  onFlowError?: (event: FlowErrorEvent) => void | Promise<void>;

  // Node level
  onNodeStart?: (event: NodeStartEvent) => void | Promise<void>;
  onNodeEnd?: (event: NodeEndEvent) => void | Promise<void>;
  onNodeError?: (event: NodeErrorEvent) => void | Promise<void>;

  // LLM level
  onLLMRequest?: (event: LLMRequestEvent) => void | Promise<void>;
  onLLMResponse?: (event: LLMResponseEvent) => void | Promise<void>;
}
