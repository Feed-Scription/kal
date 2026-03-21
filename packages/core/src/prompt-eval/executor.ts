/**
 * Flow executor for prompt evaluation
 * Runs a flow N times in parallel with isolated state per run,
 * collects outputs, cost, and latency per run via hooks.
 */

import type { FlowDefinition, NodeDefinition, StateValue, TokenUsage } from '../types/types';
import type { Fragment } from '../prompt/fragments';
import type { KalCore } from '../core';
import type { StateStore } from '../state-store';
import type { LLMResponseEvent } from '../types/hooks';
import type { EvalRunResult, RunResult } from './types';
import { createKalCore } from '../core';
import { computeAllStats } from './stats';

export interface EvalProgressEvent {
  completedRuns: number;
  totalRuns: number;
  latestRun?: RunResult;
}

export interface EvalRunOptions {
  flow: FlowDefinition;
  flowId: string;
  nodeId: string;
  variantFragments?: Fragment[];
  runs: number;
  input?: Record<string, any>;
  state?: Record<string, StateValue>;
  resolver?: (id: string) => string;
  variantLabel?: string;
  modelOverride?: string;
  onProgress?: (event: EvalProgressEvent) => void;
}

/**
 * Deep clone a FlowDefinition and replace the target node's fragments
 */
function cloneFlowWithVariant(
  flow: FlowDefinition,
  nodeId: string,
  fragments: Fragment[],
): FlowDefinition {
  const cloned: FlowDefinition = JSON.parse(JSON.stringify(flow));
  const node = cloned.data.nodes.find((n: NodeDefinition) => n.id === nodeId);
  if (!node) {
    throw new Error(`Node "${nodeId}" not found in flow`);
  }
  if (node.type !== 'PromptBuild') {
    throw new Error(`Node "${nodeId}" is type "${node.type}", expected PromptBuild`);
  }
  if (!node.config) node.config = {};
  node.config.fragments = fragments;
  return cloned;
}

/**
 * Find and validate a PromptBuild node in a flow.
 * Also accepts GenerateText nodes for render inspection.
 */
export function findPromptBuildNode(flow: FlowDefinition, nodeId: string): NodeDefinition {
  const node = flow.data.nodes.find((n: NodeDefinition) => n.id === nodeId);
  if (!node) {
    throw new Error(`Node "${nodeId}" not found in flow`);
  }
  const allowed = new Set(['PromptBuild', 'GenerateText']);
  if (!allowed.has(node.type)) {
    throw new Error(`Node "${nodeId}" is type "${node.type}", expected PromptBuild or GenerateText`);
  }
  return node;
}

/**
 * Extract cost from provider-reported usage (e.g. OpenRouter), fall back to 0
 */
function extractCost(usage: TokenUsage): number {
  return typeof usage.cost === 'number' ? usage.cost : 0;
}

/**
 * Run a flow N times in parallel and collect evaluation data.
 * Each run gets an isolated KalCore instance with its own state and hooks,
 * but shares the parent core's node registry (read-only during execution).
 */
export async function runEval(
  core: KalCore,
  stateStore: StateStore,
  options: EvalRunOptions,
): Promise<EvalRunResult> {
  const { flow, flowId, nodeId, variantFragments, runs, input, state, resolver, modelOverride, onProgress } = options;

  // Validate the target node exists
  findPromptBuildNode(flow, nodeId);

  // Prepare the flow (with or without variant)
  const effectiveFlow = variantFragments
    ? cloneFlowWithVariant(flow, nodeId, variantFragments)
    : flow;

  // Snapshot original state for isolation
  const originalState = stateStore.getAll();
  const targetState = state ? { ...originalState, ...state } : { ...originalState };
  const effectiveModel = modelOverride ?? core.config.llm.defaultModel;

  let completedCount = 0;
  const perRun: RunResult[] = new Array(runs);
  const outputs: any[] = new Array(runs);

  const runOne = async (i: number) => {
    try {
      // Create isolated core with cloned state but shared registry
      const isolatedCore = createKalCore({
        config: {
          ...core.config,
          llm: { ...core.config.llm, defaultModel: effectiveModel },
        },
        initialState: JSON.parse(JSON.stringify(targetState)),
        registry: core.registry,
      });
      await isolatedCore.ready;

      let runCost = 0;
      const llmRawOutputs: string[] = [];
      isolatedCore.hooks.on('onLLMResponse', (event: LLMResponseEvent) => {
        if (!event.cached) {
          runCost += extractCost(event.usage);
        }
        llmRawOutputs.push(event.text);
      });

      const startTime = Date.now();
      const result = await isolatedCore.executeFlow(effectiveFlow, flowId, input ?? {}, resolver);
      const latency = Date.now() - startTime;

      const output = Object.keys(result.outputs).length === 1
        ? Object.values(result.outputs)[0]
        : result.outputs;

      const runResult: RunResult = {
        output,
        cost: Math.round(runCost * 10000) / 10000,
        latency,
        llmRawOutputs: llmRawOutputs.length > 0 ? llmRawOutputs : undefined,
      };

      // Record errors but keep the run
      if (result.errors.length > 0) {
        const errMsg = result.errors.map((e: any) => `${e.nodeId}: ${e.message}`).join('; ');
        if (output === undefined || (typeof output === 'object' && Object.keys(output).length === 0)) {
          runResult.output = `[ERROR] ${errMsg}`;
        }
      }

      perRun[i] = runResult;
      outputs[i] = runResult.output;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      perRun[i] = { output: `[ERROR] ${errorMsg}`, cost: 0, latency: 0 };
      outputs[i] = `[ERROR] ${errorMsg}`;
    }

    completedCount++;
    onProgress?.({ completedRuns: completedCount, totalRuns: runs, latestRun: perRun[i] });
  };

  await Promise.all(Array.from({ length: runs }, (_, i) => runOne(i)));

  const totalCost = perRun.reduce((sum, r) => sum + r.cost, 0);
  const avgLatency = runs > 0
    ? Math.round(perRun.reduce((sum, r) => sum + r.latency, 0) / runs)
    : 0;
  const { numeric: numericStats, boolean: booleanStats } = computeAllStats(perRun);

  return {
    flowPath: flowId,
    nodeId,
    variant: options.variantLabel ?? (variantFragments ? 'variant' : 'baseline'),
    model: effectiveModel,
    runs,
    result: {
      outputs,
      cost: Math.round(totalCost * 10000) / 10000,
      avgLatency,
      perRun,
      numericStats,
      booleanStats: Object.keys(booleanStats).length > 0 ? booleanStats : undefined,
    },
  };
}
