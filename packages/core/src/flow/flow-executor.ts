/**
 * FlowExecutor - event-driven flow execution engine
 */

import type { FlowDefinition } from '../types/types';
import type { NodeContext } from '../types/node';
import type { NodeExecutionError } from '../types/errors';
import { FlowRunTimeoutError } from '../types/errors';
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
  private defaultNodeTimeoutMs: number;

  constructor(params: {
    registry: NodeRegistry;
    hookManager: HookManager;
    contextFactory: (executionId: string, nodeId: string) => NodeContext;
    defaultNodeTimeoutMs?: number;
  }) {
    this.registry = params.registry;
    this.hookManager = params.hookManager;
    this.contextFactory = params.contextFactory;
    this.defaultNodeTimeoutMs = params.defaultNodeTimeoutMs ?? 30000;
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
    maxConcurrency?: number,
    runDeadlineAt?: number,
    runTimeoutMs?: number,
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

    try {
      while (!scheduler.isFinished()) {
        this.assertRunDeadline(flowId, runDeadlineAt, runTimeoutMs);
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

            const nodeTimeout = nodeDef.config?.timeout ?? this.defaultNodeTimeoutMs;
            const outputs = nodeTimeout === 0
              ? await executeNode(nodeDef, connectedValues, this.registry, context)
              : await this.executeWithTimeout(
                  () => executeNode(nodeDef, connectedValues, this.registry, context),
                  nodeTimeout,
                  `Node "${nodeId}" (${nodeDef.type}) execution timeout after ${nodeTimeout}ms`,
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
            if (error instanceof FlowRunTimeoutError || (error as { code?: string }).code === 'FLOW_RUN_TIMEOUT') {
              throw error;
            }

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

        await this.awaitWithinRunDeadline(
          Promise.all(promises),
          flowId,
          runDeadlineAt,
          runTimeoutMs,
        );
      }
    } catch (error) {
      if (error instanceof FlowRunTimeoutError || (error as { code?: string }).code === 'FLOW_RUN_TIMEOUT') {
        await this.hookManager.emit('onFlowError', {
          executionId,
          flowId,
          error: {
            nodeId: '__flow__',
            nodeType: 'Flow',
            errorType: 'timeout',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        });
      }
      throw error;
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

  private assertRunDeadline(
    flowId: string,
    runDeadlineAt?: number,
    runTimeoutMs?: number,
  ): void {
    if (runDeadlineAt === undefined) {
      return;
    }
    if (Date.now() >= runDeadlineAt) {
      throw new FlowRunTimeoutError(flowId, runTimeoutMs ?? 0);
    }
  }

  private async awaitWithinRunDeadline<T>(
    promise: Promise<T>,
    flowId: string,
    runDeadlineAt?: number,
    runTimeoutMs?: number,
  ): Promise<T> {
    if (runDeadlineAt === undefined) {
      return await promise;
    }

    const remainingMs = runDeadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new FlowRunTimeoutError(flowId, runTimeoutMs ?? 0);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new FlowRunTimeoutError(flowId, runTimeoutMs ?? remainingMs));
          }, remainingMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
