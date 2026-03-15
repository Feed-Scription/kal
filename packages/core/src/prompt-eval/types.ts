/**
 * Types for prompt evaluation infrastructure
 */

import type { Fragment } from '../prompt/fragments';

/**
 * Rendered fragment with activation status
 */
export interface RenderedFragment {
  id: string;
  type: string;
  active: boolean;
  rendered: string;
  condition?: string;
}

/**
 * Result of rendering a prompt
 */
export interface RenderResult {
  nodeId: string;
  renderedText: string;
  fragments: RenderedFragment[];
  state: Record<string, any>;
}

/**
 * Single run result
 */
export interface RunResult {
  output: any;
  cost: number;
  latency: number;
  llmRawOutputs?: string[];
}

/**
 * Numeric statistics for a field
 */
export interface NumericStats {
  min: number;
  max: number;
  median: number;
  mean: number;
  stddev: number;
  p25: number;
  p75: number;
}

/**
 * Boolean statistics for a field
 */
export interface BooleanStats {
  trueCount: number;
  falseCount: number;
  trueRate: number;
  nullCount: number;
}

/**
 * Evaluation run result
 */
export interface EvalRunResult {
  flowPath: string;
  nodeId: string;
  variant: string;
  runs: number;
  result: {
    outputs: any[];
    cost: number;
    avgLatency: number;
    perRun: RunResult[];
    numericStats: Record<string, NumericStats>;
    booleanStats?: Record<string, BooleanStats>;
  };
}

/**
 * Variant definition (replacement fragments)
 */
export interface VariantDefinition {
  fragments: Fragment[];
}
