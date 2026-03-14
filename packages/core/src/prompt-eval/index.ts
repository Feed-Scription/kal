/**
 * Prompt evaluation infrastructure — public API
 */

export type {
  RenderResult,
  RenderedFragment,
  EvalRunResult,
  RunResult,
  NumericStats,
  BooleanStats,
  VariantDefinition,
} from './types';

export { renderPrompt } from './resolver';
export { runEval, findPromptBuildNode } from './executor';
export type { EvalRunOptions } from './executor';
export { computeStats, computeAllStats, computeBooleanStats } from './stats';
