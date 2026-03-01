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
  outputs: Record<string, Record<string, any>>;
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

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          const error: any = new Error(timeoutMessage);
          error.isTimeout = true;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Execute a flow
   */
  async execute(
    flow: FlowDefinition,
    flowId: string,
    inputData?: Record<string, any>,
    maxConcurrency?: number
  ): Promise<FlowExecutionResult> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    const errors: NodeExecutionError[] = [];

    // Build graph
    const graph = new FlowGraph(flow);
    const scheduler = new Scheduler(graph, maxConcurrency);

    // Store node outputs: nodeId -> { handleName: value }
    const nodeOutputs: Record<string, Record<string, any>> = {};

    // Emit flow start
    await this.hookManager.emit('onFlowStart', {
      executionId,
      flowId,
      timestamp: Date.now(),
    });

    // Inject input data into SignalIn nodes
    if (inputData) {
      for (const node of graph.getEntryNodes()) {
        if (node.definition.type === 'SignalIn') {
          // Only map declared outputs
          const outputs: Record<string, any> = {};
          for (const output of node.definition.outputs) {
            if (output.name in inputData) {
              outputs[output.name] = inputData[output.name];
            }
          }
          // Warn about undeclared fields
          for (const key in inputData) {
            if (!node.definition.outputs.some(o => o.name === key)) {
              console.warn(`SignalIn node "${node.id}" received undeclared field "${key}", ignoring`);
            }
          }
          nodeOutputs[node.id] = outputs;
        }
      }
    }

    // Execute loop
    while (!scheduler.isFinished()) {
      const readyNodes = scheduler.getReadyNodes();

      if (readyNodes.length === 0) {
        break;
      }

      // Execute ready nodes in parallel
      const promises = readyNodes.map(async (nodeId) => {
        scheduler.markRunning(nodeId);
        const graphNode = graph.getNode(nodeId)!;
        const nodeDef = graphNode.definition;

        // Resolve connected input values from upstream outputs
        const connectedValues: Record<string, any> = {};
        for (const edge of graphNode.inEdges) {
          const sourceOutputs = nodeOutputs[edge.source];
          if (sourceOutputs && edge.sourceHandle in sourceOutputs) {
            connectedValues[edge.targetHandle] = sourceOutputs[edge.sourceHandle];
          }
        }

        // Emit node start
        await this.hookManager.emit('onNodeStart', {
          executionId,
          nodeId,
          nodeType: nodeDef.type,
          inputs: connectedValues,
          timestamp: Date.now(),
        });

        const nodeStartTime = Date.now();

        try {
          const context = this.contextFactory(executionId, nodeId);

          // For SignalIn with pre-injected data, use that
          if (nodeDef.type === 'SignalIn' && nodeOutputs[nodeId]) {
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

          // Execute node with timeout
          const nodeTimeout = nodeDef.config?.timeout ?? 30000; // Default 30s
          const outputs = await this.executeWithTimeout(
            () => executeNode(nodeDef, connectedValues, this.registry, context),
            nodeTimeout,
            `Node "${nodeId}" (${nodeDef.type}) execution timeout after ${nodeTimeout}ms`
          );

          nodeOutputs[nodeId] = outputs;
          scheduler.markCompleted(nodeId);

          await this.hookManager.emit('onNodeEnd', {
            executionId,
            nodeId,
            nodeType: nodeDef.type,
            outputs,
            durationMs: Date.now() - nodeStartTime,
            timestamp: Date.now(),
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

    // Emit flow end or error
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

    return { executionId, flowId, outputs: nodeOutputs, errors, durationMs };
  }
}
