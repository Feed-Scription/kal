import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { StateValue } from '@kal-ai/core';
import type { EngineCliIO } from '../../types';

/**
 * Resolve flow path to a flow ID and locate the project root.
 * Supports both:
 *   - Relative path: guess-who/flow/answer-question.json (project = guess-who)
 *   - Flow ID with --project: answer-question --project guess-who
 */
export function resolveFlowInfo(
  flowPath: string,
  projectPath: string | undefined,
  cwd: string,
): { projectRoot: string; flowId: string } {
  const absPath = resolve(cwd, flowPath);

  if (flowPath.includes('/') || flowPath.endsWith('.json')) {
    const flowDirIndex = absPath.lastIndexOf('/flow/');
    if (flowDirIndex === -1) {
      throw new Error(
        `Cannot determine project root from flow path "${flowPath}". ` +
        `Expected path like "project/flow/name.json" or use --project.`
      );
    }
    const projectRoot = absPath.slice(0, flowDirIndex);
    const fileName = absPath.slice(flowDirIndex + '/flow/'.length);
    const flowId = fileName.replace(/\.json$/, '');
    return { projectRoot, flowId };
  }

  if (!projectPath) {
    throw new Error('When using a flow ID, --project is required');
  }
  return {
    projectRoot: resolve(cwd, projectPath),
    flowId: flowPath.replace(/\.json$/, ''),
  };
}

/**
 * Parse a JSON string, supporting both inline JSON and @file references
 */
export async function parseJsonArg(value: string, cwd: string): Promise<any> {
  if (value.startsWith('@')) {
    const filePath = resolve(cwd, value.slice(1));
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  }
  return JSON.parse(value);
}

/**
 * Convert a plain object to StateValue records
 */
export function toStateValues(obj: Record<string, any>): Record<string, StateValue> {
  const result: Record<string, StateValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
      result[key] = value as StateValue;
      continue;
    }
    if (typeof value === 'string') result[key] = { type: 'string', value };
    else if (typeof value === 'number') result[key] = { type: 'number', value };
    else if (typeof value === 'boolean') result[key] = { type: 'boolean', value };
    else if (Array.isArray(value)) result[key] = { type: 'array', value };
    else if (value !== null && typeof value === 'object') result[key] = { type: 'object', value };
  }
  return result;
}

export function writePrettyRender(io: EngineCliIO, result: any): void {
  io.stdout(`Node: ${result.nodeId}\n`);
  io.stdout('---\n');
  io.stdout(`Rendered text:\n${result.renderedText}\n`);
  io.stdout('---\n');
  io.stdout('Fragments:\n');
  for (const f of result.fragments) {
    const status = f.active ? '✓' : '✗';
    let line = `  [${status}] ${f.id} (${f.type})`;
    if (f.condition) line += ` when: ${f.condition}`;
    io.stdout(line + '\n');
  }
  io.stdout('---\n');
  io.stdout(`State: ${JSON.stringify(result.state)}\n`);
}

export function writePrettyRun(io: EngineCliIO, result: any): void {
  const modelStr = result.model ? ` | Model: ${result.model}` : '';
  io.stdout(`Flow: ${result.flowPath} | Node: ${result.nodeId} | Variant: ${result.variant}${modelStr}\n`);
  io.stdout(`Runs: ${result.runs} | Total cost: $${result.result.cost} | Avg latency: ${result.result.avgLatency}ms\n`);
  io.stdout('---\n');

  for (let i = 0; i < result.result.perRun.length; i++) {
    const run = result.result.perRun[i];
    const output = typeof run.output === 'string'
      ? run.output.slice(0, 200)
      : JSON.stringify(run.output).slice(0, 200);
    io.stdout(`[${i}] ${run.latency}ms $${run.cost} → ${output}\n`);
  }

  io.stdout('---\n');
  io.stdout('Numeric Stats:\n');
  for (const [key, stats] of Object.entries(result.result.numericStats)) {
    const s = stats as any;
    io.stdout(`  ${key}: median=${s.median} mean=${s.mean} stddev=${s.stddev} [${s.min}..${s.max}]\n`);
  }

  if (result.result.booleanStats && Object.keys(result.result.booleanStats).length > 0) {
    io.stdout('\nBoolean Stats:\n');
    for (const [key, stats] of Object.entries(result.result.booleanStats)) {
      const s = stats as any;
      io.stdout(`  ${key}: true=${s.trueCount} false=${s.falseCount} rate=${(s.trueRate * 100).toFixed(1)}%`);
      if (s.nullCount > 0) io.stdout(` null=${s.nullCount}`);
      io.stdout('\n');
    }
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function buildComparison(a: any, b: any, labelA: string, labelB: string): any {
  const result: any = {
    a: { label: labelA, variant: a.variant, runs: a.runs },
    b: { label: labelB, variant: b.variant, runs: b.runs },
    diff: {},
  };

  if (a.result && b.result) {
    result.diff.cost = {
      a: a.result.cost,
      b: b.result.cost,
      delta: round4(b.result.cost - a.result.cost),
      pctChange: a.result.cost > 0 ? round4((b.result.cost - a.result.cost) / a.result.cost * 100) : null,
    };
    result.diff.avgLatency = {
      a: a.result.avgLatency,
      b: b.result.avgLatency,
      delta: b.result.avgLatency - a.result.avgLatency,
      pctChange: a.result.avgLatency > 0 ? round4((b.result.avgLatency - a.result.avgLatency) / a.result.avgLatency * 100) : null,
    };

    const numericDiff: Record<string, any> = {};
    const allNumericKeys = new Set([
      ...Object.keys(a.result.numericStats ?? {}),
      ...Object.keys(b.result.numericStats ?? {}),
    ]);
    for (const key of allNumericKeys) {
      const sa = a.result.numericStats?.[key];
      const sb = b.result.numericStats?.[key];
      if (sa && sb) {
        numericDiff[key] = {
          a: { median: sa.median, mean: sa.mean },
          b: { median: sb.median, mean: sb.mean },
          medianDelta: round4(sb.median - sa.median),
          meanDelta: round4(sb.mean - sa.mean),
        };
      }
    }
    if (Object.keys(numericDiff).length > 0) {
      result.diff.numericStats = numericDiff;
    }

    const booleanDiff: Record<string, any> = {};
    const allBooleanKeys = new Set([
      ...Object.keys(a.result.booleanStats ?? {}),
      ...Object.keys(b.result.booleanStats ?? {}),
    ]);
    for (const key of allBooleanKeys) {
      const sa = a.result.booleanStats?.[key];
      const sb = b.result.booleanStats?.[key];
      if (sa && sb) {
        booleanDiff[key] = {
          a: { trueRate: sa.trueRate, trueCount: sa.trueCount },
          b: { trueRate: sb.trueRate, trueCount: sb.trueCount },
          trueRateDelta: round4(sb.trueRate - sa.trueRate),
        };
      }
    }
    if (Object.keys(booleanDiff).length > 0) {
      result.diff.booleanStats = booleanDiff;
    }
  }

  return result;
}

export function writePrettyCompare(io: EngineCliIO, comparison: any): void {
  io.stdout(`Compare: ${comparison.a.label} vs ${comparison.b.label}\n`);
  io.stdout(`  A: ${comparison.a.variant} (${comparison.a.runs} runs)\n`);
  io.stdout(`  B: ${comparison.b.variant} (${comparison.b.runs} runs)\n`);
  io.stdout('---\n');

  const diff = comparison.diff;
  if (diff.cost) {
    const sign = diff.cost.delta >= 0 ? '+' : '';
    const pct = diff.cost.pctChange !== null ? ` (${sign}${diff.cost.pctChange}%)` : '';
    io.stdout(`Cost:    A=$${diff.cost.a}  B=$${diff.cost.b}  delta=${sign}$${diff.cost.delta}${pct}\n`);
  }
  if (diff.avgLatency) {
    const sign = diff.avgLatency.delta >= 0 ? '+' : '';
    const pct = diff.avgLatency.pctChange !== null ? ` (${sign}${diff.avgLatency.pctChange}%)` : '';
    io.stdout(`Latency: A=${diff.avgLatency.a}ms  B=${diff.avgLatency.b}ms  delta=${sign}${diff.avgLatency.delta}ms${pct}\n`);
  }

  if (diff.numericStats) {
    io.stdout('\nNumeric Stats:\n');
    for (const [key, s] of Object.entries(diff.numericStats) as [string, any][]) {
      const sign = s.medianDelta >= 0 ? '+' : '';
      io.stdout(`  ${key}: A.median=${s.a.median} B.median=${s.b.median} delta=${sign}${s.medianDelta}\n`);
    }
  }

  if (diff.booleanStats) {
    io.stdout('\nBoolean Stats:\n');
    for (const [key, s] of Object.entries(diff.booleanStats) as [string, any][]) {
      const sign = s.trueRateDelta >= 0 ? '+' : '';
      io.stdout(`  ${key}: A.rate=${(s.a.trueRate * 100).toFixed(1)}% B.rate=${(s.b.trueRate * 100).toFixed(1)}% delta=${sign}${(s.trueRateDelta * 100).toFixed(1)}pp\n`);
    }
  }
}
