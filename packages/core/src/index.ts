/**
 * @kal-ai/core
 *
 * KAL-AI Core Engine - AI-driven game development engine
 */

export const version = '0.1.0';

// Types
export * from './types/types';
export * from './types/errors';
export * from './types/node';
export * from './types/hooks';

// State
export { StateStore } from './state-store';

// Config
export { ConfigLoader } from './config-loader';
export { ConfigManager } from './config';
export type { UserConfig } from './config';

// LLM
export { LLMClient } from './llm/llm-client';
export type { InvokeOptions, InvokeResult } from './llm/llm-client';
export { LLMCache } from './llm/cache';
export type { CachedResponse } from './llm/cache';
export { Telemetry } from './llm/telemetry';
export type { TelemetryRecord } from './llm/telemetry';
export { repairJson } from './llm/json-repair';
export { retry, isRetryableError } from './llm/retry';

// Hooks
export { HookManager } from './hook-manager';

// Prompt
export { base, field, when, randomSlot, budget } from './prompt/fragments';
export type { Fragment, BaseFragment, FieldFragment, WhenFragment, RandomSlotFragment, BudgetFragment } from './prompt/fragments';
export { compose, composeSegments, composeMessages, estimateTokens, formatSection, buildMessages } from './prompt/compose';
export type { PromptScope } from './prompt/compose';
export type { FormatType } from './prompt/compose';

// Node
export { NodeRegistry } from './node/node-registry';
export { executeNode, resolveInputs } from './node/node-executor';
export { CustomNodeLoader } from './node/custom-node-loader';
export { BUILTIN_NODES } from './node/builtin';
export {
  SignalIn, SignalOut, Timer,
} from './node/builtin/signal-nodes';
export {
  AddState, RemoveState, ReadState, ModifyState, ApplyState,
} from './node/builtin/state-nodes';
export {
  PromptBuild, Message, GenerateText, GenerateImage, UpdateHistory, CompactHistory,
} from './node/builtin/llm-nodes';
export {
  Regex, JSONParse, PostProcess, SubFlow,
} from './node/builtin/transform-nodes';
export {
  Constant, ComputeState,
} from './node/builtin/utility-nodes';

// Flow
export { FlowGraph } from './flow/flow-graph';
export type { GraphNode } from './flow/flow-graph';
export { FlowExecutor } from './flow/flow-executor';
export type { FlowExecutionResult } from './flow/flow-executor';
export { FlowLoader } from './flow/flow-loader';
export type { ManifestLookup } from './flow/flow-loader';
export { Scheduler } from './flow/scheduler';

// Session
export * from './types/session';
export * from './session';

// Prompt Eval
export { renderPrompt, runEval, findPromptBuildNode, computeStats, computeAllStats, computeBooleanStats } from './prompt-eval';
export type {
  RenderResult, RenderedFragment, EvalRunResult, RunResult,
  NumericStats, BooleanStats, VariantDefinition, EvalRunOptions,
} from './prompt-eval';

// Core
export { createKalCore } from './core';
export type { KalCore } from './core';
