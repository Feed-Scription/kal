/**
 * FlowExecutor - event-driven flow execution engine
 */

import type { FlowDefinition } from '../types/types';
import type { NodeContext } from '../types/node';
import type { NodeExecutionError } from '../types/errors';
import { FlowGraph } from './flow-graph';
import { Scheduler } from './scheduler';
import { executeNode } from '../node/node-executor';
import type { NodeRegistry } from '../node/node-registry';
import type { HookManager } from '../hook-manager';

/**
 * Flow execution result
 */
export interface FlowExecutionResult {
  executionId: string;
  flowId: string;
  outputs: Record<string, any>;
  errors: NodeExecutionError[];
  durationMs: number;
}

/**
 * FlowExecutor
 */
export class FlowExecutor {
  private registry: NodeRegistry;
  private hookManager: HookManager;
  private contextFactory: (executionId: string, nodeId: string) => NodeContext;

  constructor(params: {
    registry: NodeRegistry;
    hookManager: HookManager;
    contextFactory: (executionId: string, nodeId: string) => NodeContext;
  }) {
    this.registry = params.registry;
    this.hookManager = params.hookManager;
    this.contextFactory = params.contextFactory;
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            const error: any = new Error(timeoutMessage);
            error.isTimeout = true;
            reject(error);
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  async execute(
    flow: FlowDefinition,
    flowId: string,
    inputData?: Record<string, any>,
    maxConcurrency?: number
  ): Promise<FlowExecutionResult> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    const errors: NodeExecutionError[] = [];

    const graph = new FlowGraph(flow);
    const scheduler = new Scheduler(graph, maxConcurrency);
    const nodeOutputs: Record<string, Record<string, any>> = {};
    const outputChannels = new Map<string, any>();
    const inputContracts = new Map((flow.meta.inputs ?? []).map((handle) => [handle.name, handle]));

    await this.hookManager.emit('onFlowStart', {
      executionId,
      flowId,
      timestamp: Date.now(),
    });

    while (!scheduler.isFinished()) {
      const readyNodes = scheduler.getReadyNodes();

      if (readyNodes.length === 0) {
        break;
      }

      const promises = readyNodes.map(async (nodeId) => {
        scheduler.markRunning(nodeId);
        const graphNode = graph.getNode(nodeId)!;
        const nodeDef = graphNode.definition;

        const connectedValues: Record<string, any> = {};
        for (const edge of graphNode.inEdges) {
          const sourceOutputs = nodeOutputs[edge.source];
          if (sourceOutputs && edge.sourceHandle in sourceOutputs) {
            connectedValues[edge.targetHandle] = sourceOutputs[edge.sourceHandle];
          }
        }

        await this.hookManager.emit('onNodeStart', {
          executionId,
          nodeId,
          nodeType: nodeDef.type,
          inputs: connectedValues,
          timestamp: Date.now(),
        });

        const nodeStartTime = Date.now();
        const nodeWarnings: string[] = [];

        try {
          const baseContext = this.contextFactory(executionId, nodeId);
          // Wrap logger.warn to collect warnings
          const context: NodeContext = {
            ...baseContext,
            logger: {
              ...baseContext.logger,
              warn: (message: string, meta?: object) => {
                nodeWarnings.push(message);
                baseContext.logger.warn(message, meta);
              },
            },
          };

          if (nodeDef.type === 'SignalIn') {
            const channel = nodeDef.config?.channel as string;
            const contract = inputContracts.get(channel);
            const hasInput = inputData ? Object.prototype.hasOwnProperty.call(inputData, channel) : false;
            const value = hasInput ? inputData?.[channel] : contract?.defaultValue;

            if (!hasInput && contract?.required && contract.defaultValue === undefined) {
              throw new Error(`Missing required flow input channel "${channel}"`);
            }

            nodeOutputs[nodeId] = { data: value };
            scheduler.markCompleted(nodeId);

            await this.hookManager.emit('onNodeEnd', {
              executionId,
              nodeId,
              nodeType: nodeDef.type,
              outputs: nodeOutputs[nodeId]!,
              durationMs: Date.now() - nodeStartTime,
              timestamp: Date.now(),
            });
            return;
          }

          const nodeTimeout = nodeDef.config?.timeout ?? 30000;
          const outputs = await this.executeWithTimeout(
            () => executeNode(nodeDef, connectedValues, this.registry, context),
            nodeTimeout,
            `Node "${nodeId}" (${nodeDef.type}) execution timeout after ${nodeTimeout}ms`
          );

          nodeOutputs[nodeId] = outputs;
          scheduler.markCompleted(nodeId);

          if (nodeDef.type === 'SignalOut') {
            const channel = nodeDef.config?.channel as string;
            outputChannels.set(channel, outputs.data);
          }

          await this.hookManager.emit('onNodeEnd', {
            executionId,
            nodeId,
            nodeType: nodeDef.type,
            outputs,
            durationMs: Date.now() - nodeStartTime,
            timestamp: Date.now(),
            warnings: nodeWarnings.length > 0 ? nodeWarnings : undefined,
          });
        } catch (error) {
          const isTimeout = (error as any).isTimeout === true;
          const nodeError: NodeExecutionError = {
            nodeId,
            nodeType: nodeDef.type,
            errorType: isTimeout ? 'timeout' : 'execution',
            message: (error as Error).message,
            stack: (error as Error).stack,
            timestamp: Date.now(),
          };
          errors.push(nodeError);
          scheduler.markFailed(nodeId);

          await this.hookManager.emit('onNodeError', {
            executionId,
            nodeId,
            nodeType: nodeDef.type,
            error: nodeError,
            timestamp: Date.now(),
          });
        }
      });

      await Promise.all(promises);
    }

    const durationMs = Date.now() - startTime;

    if (errors.length > 0) {
      await this.hookManager.emit('onFlowError', {
        executionId,
        flowId,
        error: errors[0]!,
        timestamp: Date.now(),
      });
    }

    await this.hookManager.emit('onFlowEnd', {
      executionId,
      flowId,
      timestamp: Date.now(),
      durationMs,
    });

    return {
      executionId,
      flowId,
      outputs: Object.fromEntries(outputChannels),
      errors,
      durationMs,
    };
  }
}
