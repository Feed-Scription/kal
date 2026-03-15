/**
 * Numeric and boolean statistics calculator
 */

import type { NumericStats, BooleanStats } from './types';

/**
 * Compute statistics for an array of numbers
 */
export function computeStats(values: number[]): NumericStats {
  if (values.length === 0) {
    return { min: 0, max: 0, median: 0, mean: 0, stddev: 0, p25: 0, p75: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  return {
    min: sorted[0]!,
    max: sorted[n - 1]!,
    median: percentile(sorted, 50),
    mean: round(mean),
    stddev: round(stddev),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
  };
}

/**
 * Compute percentile from a sorted array using linear interpolation
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return round(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Extract numeric fields from an object (shallow)
 */
export function extractNumericFields(obj: any): Record<string, number> {
  if (obj == null || typeof obj !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extract boolean fields from an object (shallow)
 */
export function extractBooleanFields(obj: any): Record<string, boolean> {
  if (obj == null || typeof obj !== 'object') return {};
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Compute boolean statistics for an array of boolean values
 */
export function computeBooleanStats(values: (boolean | null | undefined)[]): BooleanStats {
  let trueCount = 0;
  let falseCount = 0;
  let nullCount = 0;
  for (const v of values) {
    if (v === true) trueCount++;
    else if (v === false) falseCount++;
    else nullCount++;
  }
  const total = trueCount + falseCount;
  return {
    trueCount,
    falseCount,
    trueRate: total > 0 ? round(trueCount / total) : 0,
    nullCount,
  };
}

/**
 * Compute stats for all numeric fields across multiple run outputs,
 * plus built-in cost/latency/outputLength stats
 */
export function computeAllStats(
  perRun: Array<{ output: any; cost: number; latency: number }>,
): { numeric: Record<string, NumericStats>; boolean: Record<string, BooleanStats> } {
  const numeric: Record<string, NumericStats> = {};
  const boolean: Record<string, BooleanStats> = {};

  // Built-in numeric stats
  numeric.cost = computeStats(perRun.map((r) => r.cost));
  numeric.latency = computeStats(perRun.map((r) => r.latency));
  numeric.outputLength = computeStats(
    perRun.map((r) => {
      const out = typeof r.output === 'string' ? r.output : JSON.stringify(r.output);
      return out.length;
    }),
  );

  // Extract numeric and boolean fields from parsed JSON outputs
  const numericFieldValues: Record<string, number[]> = {};
  const booleanFieldValues: Record<string, (boolean | null | undefined)[]> = {};

  for (const run of perRun) {
    let parsed: any = run.output;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        continue;
      }
    }

    const numFields = extractNumericFields(parsed);
    for (const [key, value] of Object.entries(numFields)) {
      if (!numericFieldValues[key]) numericFieldValues[key] = [];
      numericFieldValues[key]!.push(value);
    }

    const boolFields = extractBooleanFields(parsed);
    for (const [key, value] of Object.entries(boolFields)) {
      if (!booleanFieldValues[key]) booleanFieldValues[key] = [];
      booleanFieldValues[key]!.push(value);
    }
  }

  for (const [key, values] of Object.entries(numericFieldValues)) {
    if (values.length === perRun.length) {
      numeric[`output.${key}`] = computeStats(values);
    }
  }

  for (const [key, values] of Object.entries(booleanFieldValues)) {
    if (values.length === perRun.length) {
      boolean[`output.${key}`] = computeBooleanStats(values);
    }
  }

  return { numeric, boolean };
}
