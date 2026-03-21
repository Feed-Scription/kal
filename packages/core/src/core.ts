/**
 * KAL Core Engine - Main entry point
 */

import { StateStore } from './state-store';
import { LLMClient } from './llm/llm-client';
import { HookManager } from './hook-manager';
import { NodeRegistry } from './node/node-registry';
import { BUILTIN_NODES } from './node/builtin';
import { CustomNodeLoader } from './node/custom-node-loader';
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
  ready: Promise<void>;
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
  customNodes?: Record<string, any>;
  customNodeProjectRoot?: string;
  /** Share an existing registry (e.g. for parallel eval runs that need custom nodes). */
  registry?: NodeRegistry;
}): KalCore {
  const { config, initialState, hooks: userHooks, customNodes, customNodeProjectRoot } = params;

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

  // Reuse provided registry or create a fresh one with built-in nodes
  const registry = params.registry ?? (() => {
    const reg = new NodeRegistry();
    for (const node of BUILTIN_NODES) {
      reg.register(node);
    }
    return reg;
  })();

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
      append: (key: string, value: any) => {
        const result = state.append(key, value);
        if (!result.success) {
          throw result.error;
        }
      },
      appendMany: (key: string, values: any[]) => {
        const result = state.appendMany(key, values);
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

  // Create flow loader with manifest lookup from registry
  const flowLoader = new FlowLoader((nodeType: string) => {
    const node = registry.get(nodeType);
    if (!node) return undefined;
    return { inputs: node.inputs, outputs: node.outputs };
  });

  // Flow resolver fallback (set by loadFlow)
  let defaultResolver: ((id: string) => string) | undefined;

  const executeFlowInternal = async (
    flowDef: FlowDefinition,
    flowId: string,
    inputData?: Record<string, any>,
    resolver?: (id: string) => string,
    runDeadlineAt?: number,
  ) => {
    await ready;
    const executor = createExecutor(resolver, runDeadlineAt);
    return executor.execute(
      flowDef,
      flowId,
      inputData,
      config.engine.maxConcurrentFlows,
      runDeadlineAt,
      config.engine.runTimeout,
    );
  };

  // Context factory that accepts an optional resolver for SubFlow execution
  const createContextFactory = (resolver?: (id: string) => string, runDeadlineAt?: number) =>
    (executionId: string, nodeId: string): NodeContext => {
      const baseContext = contextFactory(executionId, nodeId);
      const effectiveResolver = resolver ?? defaultResolver;
      return {
        ...baseContext,
        flow: effectiveResolver
          ? {
              execute: async (flowRef: string, inputs: Record<string, any>) => {
                const subFlow = flowLoader.load(flowRef, effectiveResolver);
                const result = await executeFlowInternal(
                  subFlow,
                  flowRef,
                  inputs,
                  effectiveResolver,
                  runDeadlineAt,
                );
                return result.outputs;
              },
            }
          : undefined,
      };
    };

  const createExecutor = (resolver?: (id: string) => string, runDeadlineAt?: number) =>
    new FlowExecutor({
      registry,
      hookManager,
      contextFactory: createContextFactory(resolver, runDeadlineAt),
      defaultNodeTimeoutMs: config.engine.nodeTimeout,
    });

  // When a shared registry is provided, custom nodes are already loaded — skip.
  const ready = params.registry
    ? Promise.resolve()
    : (async () => {
        if (customNodes) {
          await CustomNodeLoader.loadFromModules(customNodes, registry);
        }
        if (customNodeProjectRoot) {
          await CustomNodeLoader.loadFromProject(customNodeProjectRoot, registry);
        }
      })();

  return {
    config,
    state,
    registry,
    hooks: hookManager,
    ready,

    async executeFlow(flowDef: FlowDefinition, flowId: string, inputData?: Record<string, any>, resolver?: (id: string) => string) {
      const runDeadlineAt = config.engine.runTimeout > 0 ? Date.now() + config.engine.runTimeout : undefined;
      return executeFlowInternal(flowDef, flowId, inputData, resolver, runDeadlineAt);
    },

    loadFlow(flowId: string, resolver: (id: string) => string) {
      defaultResolver = resolver;
      return flowLoader.load(flowId, resolver);
    },
  };
}
