/**
 * CLI command: kal eval
 *
 * Subcommands:
 *   kal eval render <flow> --node <id> [--state <json>] [--format json|pretty]
 *   kal eval run <flow> --node <id> [--variant <file>] [--runs N] [--input <json>] [--state <json>] [--format json|pretty]
 */

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  renderPrompt,
  runEval,
  findPromptBuildNode,
} from '@kal-ai/core';
import type { StateValue, Fragment } from '@kal-ai/core';
import type { EngineCliIO } from '../types';
import type { EngineRuntime } from '../runtime';
import { ensureUserConfig } from '../ensure-user-config';

interface EvalCommandDependencies {
  cwd: string;
  io: EngineCliIO;
  createRuntime(projectRoot: string): Promise<EngineRuntime>;
}

interface ParsedEvalArgs {
  subcommand: 'render' | 'run';
  flowPath: string;
  node: string;
  variant?: string;
  runs: number;
  input?: string;
  state?: string;
  format: 'json' | 'pretty';
  projectPath?: string;
}

function parseEvalArgs(tokens: string[]): ParsedEvalArgs {
  if (tokens.length === 0) {
    throw new Error('Missing subcommand. Usage: kal eval <render|run> ...');
  }

  const subcommand = tokens[0]!;
  if (subcommand !== 'render' && subcommand !== 'run') {
    throw new Error(`Unknown subcommand: ${subcommand}. Expected "render" or "run".`);
  }

  let flowPath: string | undefined;
  let node: string | undefined;
  let variant: string | undefined;
  let runs = 5;
  let input: string | undefined;
  let state: string | undefined;
  let format: 'json' | 'pretty' = 'json';
  let projectPath: string | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token === '--node') {
      node = tokens[++i];
      if (!node) throw new Error('--node requires a value');
      continue;
    }
    if (token === '--variant') {
      variant = tokens[++i];
      if (!variant) throw new Error('--variant requires a file path');
      continue;
    }
    if (token === '--runs') {
      const val = tokens[++i];
      if (!val) throw new Error('--runs requires a number');
      runs = parseInt(val, 10);
      if (!Number.isFinite(runs) || runs < 1) throw new Error('--runs must be a positive integer');
      continue;
    }
    if (token === '--input') {
      input = tokens[++i];
      if (!input) throw new Error('--input requires a JSON string');
      continue;
    }
    if (token === '--state') {
      state = tokens[++i];
      if (!state) throw new Error('--state requires a JSON string');
      continue;
    }
    if (token === '--format') {
      const val = tokens[++i];
      if (val !== 'json' && val !== 'pretty') throw new Error('--format must be json or pretty');
      format = val;
      continue;
    }
    if (token === '--project') {
      projectPath = tokens[++i];
      if (!projectPath) throw new Error('--project requires a path');
      continue;
    }
    if (token.startsWith('--')) {
      throw new Error(`Unknown flag: ${token}`);
    }

    // Positional: flow path
    if (!flowPath) {
      flowPath = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  if (!flowPath) throw new Error('Missing flow path');
  if (!node) throw new Error('Missing --node <id>');

  return { subcommand, flowPath, node, variant, runs, input, state, format, projectPath };
}

/**
 * Resolve flow path to a flow ID and locate the project root.
 * Supports both:
 *   - Relative path: guess-who/flow/answer-question.json (project = guess-who)
 *   - Flow ID with --project: answer-question --project guess-who
 */
function resolveFlowInfo(
  flowPath: string,
  projectPath: string | undefined,
  cwd: string,
): { projectRoot: string; flowId: string } {
  const absPath = resolve(cwd, flowPath);

  // If flowPath looks like a file path (contains / or ends with .json)
  if (flowPath.includes('/') || flowPath.endsWith('.json')) {
    // Extract project root: everything before /flow/
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

  // flowPath is a flow ID, need --project
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
async function parseJsonArg(value: string, cwd: string): Promise<any> {
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
function toStateValues(obj: Record<string, any>): Record<string, StateValue> {
  const result: Record<string, StateValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    // If already a StateValue shape, use as-is
    if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
      result[key] = value as StateValue;
      continue;
    }
    // Infer type
    if (typeof value === 'string') result[key] = { type: 'string', value };
    else if (typeof value === 'number') result[key] = { type: 'number', value };
    else if (typeof value === 'boolean') result[key] = { type: 'boolean', value };
    else if (Array.isArray(value)) result[key] = { type: 'array', value };
    else if (value !== null && typeof value === 'object') result[key] = { type: 'object', value };
  }
  return result;
}

async function handleRender(
  parsed: ParsedEvalArgs,
  deps: EvalCommandDependencies,
): Promise<number> {
  const { projectRoot, flowId } = resolveFlowInfo(parsed.flowPath, parsed.projectPath, deps.cwd);

  ensureUserConfig();
  const runtime = await deps.createRuntime(projectRoot);
  const flow = runtime.getFlow(flowId);

  // Find the target node
  const node = findPromptBuildNode(flow, parsed.node);
  const fragments: Fragment[] = (node.config?.fragments as Fragment[]) ?? [];

  // Build state: start with project initial state, then merge overrides
  let state = runtime.getState();
  if (parsed.state) {
    const stateOverrides = await parseJsonArg(parsed.state, deps.cwd);
    const overrideValues = toStateValues(stateOverrides);
    state = { ...state, ...overrideValues };
  }

  // Build data from input
  let data: Record<string, any> = {};
  if (parsed.input) {
    data = await parseJsonArg(parsed.input, deps.cwd);
  }

  const result = renderPrompt(parsed.node, fragments, state, data);

  if (parsed.format === 'pretty') {
    writePrettyRender(deps.io, result);
  } else {
    deps.io.stdout(JSON.stringify(result, null, 2) + '\n');
  }

  return 0;
}

async function handleRun(
  parsed: ParsedEvalArgs,
  deps: EvalCommandDependencies,
): Promise<number> {
  const { projectRoot, flowId } = resolveFlowInfo(parsed.flowPath, parsed.projectPath, deps.cwd);

  ensureUserConfig();
  const runtime = await deps.createRuntime(projectRoot);
  const project = runtime.getProject();
  const flow = runtime.getFlow(flowId);

  // Load variant if provided
  let variantFragments: Fragment[] | undefined;
  if (parsed.variant) {
    const variantPath = resolve(deps.cwd, parsed.variant);
    const variantContent = await readFile(variantPath, 'utf8');
    const variantDef = JSON.parse(variantContent);
    if (!variantDef.fragments || !Array.isArray(variantDef.fragments)) {
      deps.io.stderr('Error: Variant file must contain {"fragments": [...]}\n');
      return 2;
    }
    variantFragments = variantDef.fragments;
  }

  // Parse input and state
  let inputData: Record<string, any> | undefined;
  if (parsed.input) {
    inputData = await parseJsonArg(parsed.input, deps.cwd);
  }

  let stateOverrides: Record<string, StateValue> | undefined;
  if (parsed.state) {
    const stateObj = await parseJsonArg(parsed.state, deps.cwd);
    stateOverrides = toStateValues(stateObj);
  }

  // Access the core and state store from the runtime
  const core = runtime.getKalCore();
  const stateStore = core.state;

  const resolver = (id: string): string => {
    const raw = project.flowTextsById[id];
    if (!raw) throw new Error(`Unknown flow: ${id}`);
    return raw;
  };

  const result = await runEval(core, stateStore, {
    flow,
    flowId,
    nodeId: parsed.node,
    variantFragments,
    runs: parsed.runs,
    input: inputData,
    state: stateOverrides,
    resolver,
    variantLabel: parsed.variant ? parsed.variant : undefined,
  });

  // Fix flowPath to use the original path
  result.flowPath = parsed.flowPath;

  if (parsed.format === 'pretty') {
    writePrettyRun(deps.io, result);
  } else {
    deps.io.stdout(JSON.stringify(result, null, 2) + '\n');
  }

  return 0;
}

function writePrettyRender(io: EngineCliIO, result: any): void {
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

function writePrettyRun(io: EngineCliIO, result: any): void {
  io.stdout(`Flow: ${result.flowPath} | Node: ${result.nodeId} | Variant: ${result.variant}\n`);
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

export async function runEvalCommand(
  tokens: string[],
  dependencies: EvalCommandDependencies,
): Promise<number> {
  let parsed: ParsedEvalArgs;
  try {
    parsed = parseEvalArgs(tokens);
  } catch (error) {
    dependencies.io.stderr(`Error: ${(error as Error).message}\n`);
    dependencies.io.stderr(
      'Usage:\n' +
      '  kal eval render <flow> --node <id> [--state <json>] [--format json|pretty]\n' +
      '  kal eval run <flow> --node <id> [--variant <file>] [--runs N] [--input <json>] [--state <json>] [--format json|pretty]\n'
    );
    return 2;
  }

  try {
    if (parsed.subcommand === 'render') {
      return await handleRender(parsed, dependencies);
    }
    return await handleRun(parsed, dependencies);
  } catch (error) {
    dependencies.io.stderr(`Error: ${(error as Error).message}\n`);
    return 1;
  }
}
