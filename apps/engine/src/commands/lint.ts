/**
 * Lint command - static analysis for KAL projects
 */

import { resolve } from 'node:path';
import { loadEngineProject } from '../project-loader';
import { validateSessionDefinition, BUILTIN_NODES, CustomNodeLoader, NodeRegistry } from '@kal-ai/core';
import type { FlowDefinition } from '@kal-ai/core';
import type { CustomNode } from '@kal-ai/core';
import type { EngineCliIO } from '../types';
import { buildCliDiagnostic } from '../debug/diagnostic-builder';
import type { DiagnosticPayload } from '../debug/types';

interface LintCommandDependencies {
  cwd: string;
  io: EngineCliIO;
}

interface ParsedLintArgs {
  projectPath?: string;
  format: 'json' | 'pretty';
}

export interface LintPayload {
  project_root: string;
  diagnostics: DiagnosticPayload[];
  summary: {
    total_issues: number;
    errors: number;
    warnings: number;
  };
}

export async function collectLintPayload(projectRoot: string): Promise<LintPayload> {
  try {
    const project = await loadEngineProject(projectRoot, { lenient: true });
    const diagnostics: DiagnosticPayload[] = [];

    if (project.session) {
      const sessionErrors = validateSessionDefinition(
        project.session,
        Object.keys(project.flowsById),
        { initialStateKeys: Object.keys(project.initialState) }
      );

      for (const error of sessionErrors) {
        diagnostics.push(
          buildCliDiagnostic({
            code: 'SESSION_VALIDATION_ERROR',
            message: error.message,
            file: 'session.json',
            jsonPath: error.path,
            phase: 'session',
            suggestions: ['Fix the session definition according to the error message'],
          })
        );
      }
    }

    if (project.session) {
      const usedFlows = new Set<string>();
      for (const step of project.session.steps) {
        if ('flowRef' in step && step.flowRef) {
          usedFlows.add(step.flowRef);
        }
      }

      // Also collect flows referenced by SubFlow nodes inside other flows
      for (const flow of Object.values(project.flowsById)) {
        for (const node of flow.data.nodes) {
          if (node.type === 'SubFlow' && node.config?.ref) {
            usedFlows.add(node.config.ref as string);
          }
        }
      }

      for (const flowId of Object.keys(project.flowsById)) {
        if (!usedFlows.has(flowId)) {
          diagnostics.push(
            buildCliDiagnostic({
              code: 'UNUSED_FLOW',
              message: `Flow "${flowId}" is not referenced by any session step or SubFlow node`,
              file: `flow/${flowId}.json`,
              flowId,
              phase: 'flow',
              severity: 'warning',
              suggestions: [
                'Remove the flow file if it is no longer needed',
                'Add a session step or SubFlow node that references this flow',
              ],
            })
          );
        }
      }
    }

    if (project.session) {
      const stateKeys = new Set(Object.keys(project.initialState));
      for (const step of project.session.steps) {
        if (step.type === 'Branch') {
          for (const condition of step.conditions) {
            const matches = typeof condition.when === 'string'
              ? condition.when.match(/state\.(\w+)/g)
              : null;
            if (matches) {
              for (const match of matches) {
                const key = match.replace('state.', '');
                if (!stateKeys.has(key)) {
                  diagnostics.push(
                    buildCliDiagnostic({
                      code: 'STATE_KEY_NOT_FOUND',
                      message: `Branch condition references undefined state key: "${key}"`,
                      file: 'session.json',
                      jsonPath: `steps[id=${step.id}]`,
                      stepId: step.id,
                      phase: 'session',
                      suggestions: [
                        `Add "${key}" to initial_state.json`,
                        'Fix the condition to reference an existing state key',
                      ],
                    })
                  );
                }
              }
            }
          }
        }
      }
    }

    const nodeManifestMap = await buildNodeManifestMap(projectRoot);
    for (const [flowId, flow] of Object.entries(project.flowsById)) {
      const flowDiags = validateFlowNodesDeep(flow, flowId, nodeManifestMap);
      diagnostics.push(...flowDiags);
    }

    return {
      project_root: projectRoot,
      diagnostics,
      summary: {
        total_issues: diagnostics.length,
        errors: diagnostics.filter((d) => d.severity === 'error').length,
        warnings: diagnostics.filter((d) => d.severity === 'warning').length,
      },
    };
  } catch (error) {
    const diagnostic = buildCliDiagnostic({
      code: 'LINT_FAILED',
      message: error instanceof Error ? error.message : String(error),
      suggestions: ['Fix the project configuration and try again'],
    });

    return {
      project_root: projectRoot,
      diagnostics: [diagnostic],
      summary: {
        total_issues: 1,
        errors: 1,
        warnings: 0,
      },
    };
  }
}

export async function runLintCommand(
  tokens: string[],
  dependencies: LintCommandDependencies,
): Promise<number> {
  const parsed = parseLintArgs(tokens);
  const projectRoot = resolve(dependencies.cwd, parsed.projectPath ?? '.');
  const payload = await collectLintPayload(projectRoot);

  const exitCode = payload.summary.errors > 0 ? 1 : 0;
  const output = parsed.format === 'json'
    ? JSON.stringify(payload, null, 2)
    : renderPretty(payload);

  dependencies.io.stdout(output + '\n');
  return exitCode;
}

function parseLintArgs(tokens: string[]): ParsedLintArgs {
  let projectPath: string | undefined;
  let format: 'json' | 'pretty' = 'pretty';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token === '--format') {
      const value = tokens[i + 1];
      if (value === 'json' || value === 'pretty') {
        format = value;
        i++;
      }
      continue;
    }

    if (!token.startsWith('--')) {
      projectPath = token;
    }
  }

  return { projectPath, format };
}

function renderPretty(payload: LintPayload): string {
  const lines: string[] = [];

  lines.push(`Linting project: ${payload.project_root}`);
  lines.push('');

  if (payload.diagnostics.length === 0) {
    lines.push('✓ No issues found');
    return lines.join('\n');
  }

  lines.push(`Found ${payload.summary.total_issues} issue(s):`);
  lines.push('');

  for (const diagnostic of payload.diagnostics) {
    const prefix = diagnostic.severity === 'error' ? '✗' : diagnostic.severity === 'warning' ? '⚠' : 'ℹ';
    const location = diagnostic.file
      ? `${diagnostic.file}${diagnostic.jsonPath ? ` (${diagnostic.jsonPath})` : ''}`
      : '';

    lines.push(`${prefix} ${diagnostic.code}: ${diagnostic.message}`);
    if (location) {
      lines.push(`  at ${location}`);
    }
    if (diagnostic.suggestions.length > 0) {
      lines.push(`  Suggestions:`);
      for (const suggestion of diagnostic.suggestions) {
        lines.push(`    - ${suggestion}`);
      }
    }
    lines.push('');
  }

  lines.push(`Summary: ${payload.summary.errors} error(s), ${payload.summary.warnings} warning(s)`);

  return lines.join('\n');
}

// ── Deep flow node validation ──

async function buildNodeManifestMap(projectRoot: string): Promise<Map<string, CustomNode>> {
  const registry = new NodeRegistry();
  for (const node of BUILTIN_NODES) {
    registry.register(node);
  }
  await CustomNodeLoader.loadFromProject(projectRoot, registry);

  const map = new Map<string, CustomNode>();
  for (const node of registry.getAll()) {
    map.set(node.type, node);
  }
  return map;
}

function validateFlowNodesDeep(
  flow: FlowDefinition,
  flowId: string,
  manifestMap: Map<string, CustomNode>,
): DiagnosticPayload[] {
  const diagnostics: DiagnosticPayload[] = [];
  const flowFile = `flow/${flowId}.json`;

  // Check: Empty flow (no nodes)
  if (flow.data.nodes.length === 0) {
    diagnostics.push(
      buildCliDiagnostic({
        code: 'EMPTY_FLOW',
        message: `Flow "${flowId}" has no nodes`,
        file: flowFile,
        flowId,
        phase: 'flow',
        severity: 'warning',
        suggestions: ['Add nodes to the flow or remove the flow file'],
      })
    );
    return diagnostics;
  }

  // Build edge index: which inputs have incoming edges
  const connectedInputs = new Set<string>(); // "nodeId:handleName"
  const nodesWithEdges = new Set<string>();
  for (const edge of flow.data.edges) {
    connectedInputs.add(`${edge.target}:${edge.targetHandle}`);
    nodesWithEdges.add(edge.source);
    nodesWithEdges.add(edge.target);
  }

  // Check: Orphan nodes (no edges at all)
  for (const node of flow.data.nodes) {
    if (!nodesWithEdges.has(node.id) && flow.data.nodes.length > 1) {
      diagnostics.push(
        buildCliDiagnostic({
          code: 'ORPHAN_NODE',
          message: `Node "${node.id}" (${node.type}) has no edges in flow "${flowId}"`,
          file: flowFile,
          jsonPath: `data.nodes[id=${node.id}]`,
          flowId,
          nodeId: node.id,
          phase: 'node',
          severity: 'warning',
          suggestions: [
            `Connect "${node.id}" to other nodes in the flow`,
            'Remove the node if it is no longer needed',
          ],
        })
      );
    }
  }

  for (const node of flow.data.nodes) {
    const manifest = manifestMap.get(node.type);
    if (!manifest) continue; // custom node, skip

    // Check 1: Required inputs must have an edge or a defaultValue
    for (const input of manifest.inputs) {
      if (!input.required) continue;
      if (input.defaultValue !== undefined) continue;
      if (connectedInputs.has(`${node.id}:${input.name}`)) continue;

      diagnostics.push(
        buildCliDiagnostic({
          code: 'MISSING_REQUIRED_INPUT',
          message: `Node "${node.id}" (${node.type}) required input "${input.name}" has no incoming edge`,
          file: flowFile,
          jsonPath: `data.nodes[id=${node.id}]`,
          flowId,
          nodeId: node.id,
          phase: 'node',
          suggestions: [
            `Connect an edge to input "${input.name}" on node "${node.id}"`,
            `Or provide a Constant node wired to "${input.name}"`,
          ],
        })
      );
    }

    // Check 2: Validate node config against configSchema
    if (manifest.configSchema && node.config) {
      const configDiags = validateNodeConfig(node.id, node.type, node.config, manifest.configSchema, flowFile, flowId);
      diagnostics.push(...configDiags);
    }
  }

  return diagnostics;
}

function validateNodeConfig(
  nodeId: string,
  nodeType: string,
  config: Record<string, any>,
  schema: Record<string, any>,
  flowFile: string,
  flowId: string,
): DiagnosticPayload[] {
  const diagnostics: DiagnosticPayload[] = [];

  // Check required fields
  if (Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (config[field] === undefined || config[field] === null) {
        diagnostics.push(
          buildCliDiagnostic({
            code: 'CONFIG_MISSING_REQUIRED',
            message: `Node "${nodeId}" (${nodeType}) config missing required field "${field}"`,
            file: flowFile,
            jsonPath: `data.nodes[id=${nodeId}].config`,
            flowId,
            nodeId,
            phase: 'node',
            suggestions: [`Add "${field}" to the node's config`],
          })
        );
      }
    }
  }

  // Check additionalProperties: false
  if (schema.additionalProperties === false && schema.properties) {
    const allowedKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(config)) {
      if (!allowedKeys.has(key)) {
        diagnostics.push(
          buildCliDiagnostic({
            code: 'CONFIG_UNKNOWN_FIELD',
            message: `Node "${nodeId}" (${nodeType}) config has unknown field "${key}" (not in configSchema)`,
            file: flowFile,
            jsonPath: `data.nodes[id=${nodeId}].config.${key}`,
            flowId,
            nodeId,
            phase: 'node',
            suggestions: [
              `Remove "${key}" from config — this node type does not accept it`,
              `If "${key}" should be an input, wire it via an edge instead`,
            ],
          })
        );
      }
    }
  }

  // Check config field types against schema
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties) as [string, any][]) {
      const value = config[key];
      if (value === undefined || value === null) continue;
      const expectedType = propSchema.type;
      if (!expectedType) continue;

      const actualType = Array.isArray(value) ? 'array' : typeof value;
      const mismatch =
        (expectedType === 'string' && actualType !== 'string') ||
        (expectedType === 'number' && actualType !== 'number') ||
        (expectedType === 'integer' && actualType !== 'number') ||
        (expectedType === 'boolean' && actualType !== 'boolean') ||
        (expectedType === 'array' && actualType !== 'array') ||
        (expectedType === 'object' && (actualType !== 'object' || Array.isArray(value)));

      if (mismatch) {
        diagnostics.push(
          buildCliDiagnostic({
            code: 'CONFIG_TYPE_MISMATCH',
            message: `Node "${nodeId}" (${nodeType}) config field "${key}" expected type "${expectedType}" but got "${actualType}"`,
            file: flowFile,
            jsonPath: `data.nodes[id=${nodeId}].config.${key}`,
            flowId,
            nodeId,
            phase: 'node',
            suggestions: [`Change "${key}" to a ${expectedType} value`],
          })
        );
      }
    }
  }

  return diagnostics;
}
