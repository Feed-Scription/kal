/**
 * Flow executor for prompt evaluation
 * Runs a flow N times with optional prompt variant substitution,
 * collects outputs, cost, and latency per run via hooks.
 */

import type { FlowDefinition, NodeDefinition, StateValue, TokenUsage } from '../types/types';
import type { Fragment } from '../prompt/fragments';
import type { KalCore } from '../core';
import type { StateStore } from '../state-store';
import type { LLMResponseEvent } from '../types/hooks';
import type { EvalRunResult, RunResult } from './types';
import { computeAllStats } from './stats';

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
 * Estimate cost from token usage (rough: $0.003/1K prompt, $0.015/1K completion)
 */
function estimateCostFromUsage(usage: TokenUsage): number {
  return (usage.promptTokens * 0.003 + usage.completionTokens * 0.015) / 1000;
}

/**
 * Run a flow N times and collect evaluation data
 */
export async function runEval(
  core: KalCore,
  stateStore: StateStore,
  options: EvalRunOptions,
): Promise<EvalRunResult> {
  const { flow, flowId, nodeId, variantFragments, runs, input, state, resolver } = options;

  // Validate the target node exists
  findPromptBuildNode(flow, nodeId);

  // Prepare the flow (with or without variant)
  const effectiveFlow = variantFragments
    ? cloneFlowWithVariant(flow, nodeId, variantFragments)
    : flow;

  // Save original state for restoration between runs
  const originalState = stateStore.getAll();

  const perRun: RunResult[] = [];
  const outputs: any[] = [];

  for (let i = 0; i < runs; i++) {
    // Wrap each run in try-catch for error isolation
    try {
      // Restore state atomically before each run (restore() does clear + set internally)
      const targetState: Record<string, StateValue> = state
        ? { ...originalState, ...state }
        : { ...originalState };
      stateStore.restore(targetState);

      // Collect LLM usage and raw outputs via hook
      let runCost = 0;
      const llmRawOutputs: string[] = [];
      const onLLMResponse = (event: LLMResponseEvent) => {
        if (!event.cached) {
          runCost += estimateCostFromUsage(event.usage);
        }
        llmRawOutputs.push(event.text);
      };
      core.hooks.on('onLLMResponse', onLLMResponse);

      const startTime = Date.now();

      try {
        const result = await core.executeFlow(effectiveFlow, flowId, input ?? {}, resolver);
        const latency = Date.now() - startTime;

        // Extract output from SignalOut channels
        const output = Object.keys(result.outputs).length === 1
          ? Object.values(result.outputs)[0]
          : result.outputs;

        perRun.push({
          output,
          cost: Math.round(runCost * 10000) / 10000,
          latency,
          llmRawOutputs: llmRawOutputs.length > 0 ? llmRawOutputs : undefined,
        });
        outputs.push(output);

        if (result.errors.length > 0) {
          const errMsg = result.errors.map((e: any) => `${e.nodeId}: ${e.message}`).join('; ');
          // Still record the run but note the error in output
          if (output === undefined || (typeof output === 'object' && Object.keys(output).length === 0)) {
            outputs[outputs.length - 1] = `[ERROR] ${errMsg}`;
            perRun[perRun.length - 1]!.output = `[ERROR] ${errMsg}`;
          }
        }
      } finally {
        // Always cleanup hook even if executeFlow throws
        core.hooks.off('onLLMResponse', onLLMResponse);
      }
    } catch (error) {
      // Error isolation: record failure and continue to next run
      const errorMsg = error instanceof Error ? error.message : String(error);
      perRun.push({
        output: `[ERROR] ${errorMsg}`,
        cost: 0,
        latency: 0,
        llmRawOutputs: undefined,
      });
      outputs.push(`[ERROR] ${errorMsg}`);
      // Continue to next run instead of aborting entire eval
    }
  }

  // Restore original state after all runs
  stateStore.restore(originalState);

  const totalCost = perRun.reduce((sum, r) => sum + r.cost, 0);
  const avgLatency = runs > 0
    ? Math.round(perRun.reduce((sum, r) => sum + r.latency, 0) / runs)
    : 0;
  const { numeric: numericStats, boolean: booleanStats } = computeAllStats(perRun);

  return {
    flowPath: flowId,
    nodeId,
    variant: options.variantLabel ?? (variantFragments ? 'variant' : 'baseline'),
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
