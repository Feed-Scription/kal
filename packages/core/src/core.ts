/**
 * KAL Core Engine - Main entry point
 */

import { StateStore } from './state-store';
import { LLMClient } from './llm/llm-client';
import { HookManager } from './hook-manager';
import { NodeRegistry } from './node/node-registry';
import { BUILTIN_NODES } from './node/builtin';
import { FlowExecutor } from './flow/flow-executor';
import { FlowLoader } from './flow/flow-loader';
import type { KalConfig, FlowDefinition } from './types/types';
import type { NodeContext } from './types/node';
import type { EngineHooks } from './types/hooks';

/**
 * KAL Core Engine instance
 */
export interface KalCore {
  config: KalConfig;
  state: StateStore;
  registry: NodeRegistry;
  hooks: HookManager;
  executeFlow(flowDef: FlowDefinition, flowId: string, inputData?: Record<string, any>, resolver?: (id: string) => string): Promise<any>;
  loadFlow(flowId: string, resolver: (id: string) => string): FlowDefinition;
}

/**
 * Create a KAL Core Engine instance
 */
export function createKalCore(params: {
  config: KalConfig;
  initialState?: Record<string, any>;
  hooks?: Partial<EngineHooks>;
}): KalCore {
  const { config, initialState, hooks: userHooks } = params;

  // Initialize state
  const state = new StateStore();
  if (initialState) {
    state.loadInitialState(initialState);
  }

  // Initialize LLM client
  const llmClient = new LLMClient(config.llm);

  // Initialize hooks
  const hookManager = new HookManager();
  if (userHooks) {
    hookManager.registerAll(userHooks);
  }

  // Initialize node registry with built-in nodes
  const registry = new NodeRegistry();
  for (const node of BUILTIN_NODES) {
    registry.register(node);
  }

  // Create context factory
  const contextFactory = (executionId: string, nodeId: string): NodeContext => ({
    state: {
      get: (key: string) => state.get(key).value,
      set: (key: string, value: any) => {
        const result = state.upsert(key, value.type, value.value);
        if (!result.success) {
          throw result.error;
        }
      },
      delete: (key: string) => {
        const result = state.remove(key);
        if (!result.success) {
          throw result.error;
        }
      },
    },
    llm: {
      invoke: async (messages, options) => {
        const model = options?.model ?? config.llm.defaultModel;
        const startTime = Date.now();

        // Emit onLLMRequest hook
        await hookManager.emit('onLLMRequest', {
          executionId,
          nodeId,
          model,
          messages,
          timestamp: startTime,
        });

        try {
          const result = await llmClient.invoke(messages, {
            executionId,
            nodeId,
            ...options,
          });

          const latencyMs = Date.now() - startTime;

          // Emit onLLMResponse hook
          await hookManager.emit('onLLMResponse', {
            executionId,
            nodeId,
            model,
            text: result.text,
            usage: result.usage,
            latencyMs,
            cached: result.cached ?? false,
            timestamp: Date.now(),
          });

          return result;
        } catch (error) {
          // Re-throw error after hooks
          throw error;
        }
      },
    },
    logger: {
      debug: (message: string, meta?: object) => {
        if (config.engine.logLevel === 'debug') {
          console.debug(`[${executionId}:${nodeId}] ${message}`, meta);
        }
      },
      info: (message: string, meta?: object) => {
        if (['debug', 'info'].includes(config.engine.logLevel)) {
          console.info(`[${executionId}:${nodeId}] ${message}`, meta);
        }
      },
      warn: (message: string, meta?: object) => {
        if (['debug', 'info', 'warn'].includes(config.engine.logLevel)) {
          console.warn(`[${executionId}:${nodeId}] ${message}`, meta);
        }
      },
      error: (message: string, meta?: object) => {
        console.error(`[${executionId}:${nodeId}] ${message}`, meta);
      },
    },
    executionId,
    nodeId,
  });

  // Create flow loader
  const flowLoader = new FlowLoader();

  // Flow resolver fallback (set by loadFlow)
  let defaultResolver: ((id: string) => string) | undefined;

  // Create flow executor (forward reference for contextFactory)
  let executor: FlowExecutor;

  // Context factory that accepts an optional resolver for SubFlow execution
  const createContextFactory = (resolver?: (id: string) => string) =>
    (executionId: string, nodeId: string): NodeContext => {
      const baseContext = contextFactory(executionId, nodeId);
      const effectiveResolver = resolver ?? defaultResolver;
      return {
        ...baseContext,
        flow: effectiveResolver
          ? {
              execute: async (flowRef: string, inputs: Record<string, any>) => {
                const subFlow = flowLoader.load(flowRef, effectiveResolver);
                const result = await executor.execute(subFlow, flowRef, inputs);
                return result.outputs;
              },
            }
          : undefined,
      };
    };

  // Default executor uses no resolver
  executor = new FlowExecutor({
    registry,
    hookManager,
    contextFactory: createContextFactory(),
  });

  return {
    config,
    state,
    registry,
    hooks: hookManager,

    async executeFlow(flowDef: FlowDefinition, flowId: string, inputData?: Record<string, any>, resolver?: (id: string) => string) {
      if (resolver) {
        // Create a dedicated executor with this resolver's context factory
        const scopedExecutor = new FlowExecutor({
          registry,
          hookManager,
          contextFactory: createContextFactory(resolver),
        });
        return scopedExecutor.execute(flowDef, flowId, inputData, config.engine.maxConcurrentFlows);
      }
      return executor.execute(flowDef, flowId, inputData, config.engine.maxConcurrentFlows);
    },

    loadFlow(flowId: string, resolver: (id: string) => string) {
      defaultResolver = resolver;
      return flowLoader.load(flowId, resolver);
    },
  };
}
