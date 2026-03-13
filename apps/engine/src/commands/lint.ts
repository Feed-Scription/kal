/**
 * Lint command - static analysis for KAL projects
 */

import { resolve } from 'node:path';
import { loadEngineProject } from '../project-loader';
import { FlowLoader, validateSessionDefinition } from '@kal-ai/core';
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

interface LintPayload {
  project_root: string;
  diagnostics: DiagnosticPayload[];
  summary: {
    total_issues: number;
    errors: number;
    warnings: number;
  };
}

export async function runLintCommand(
  tokens: string[],
  dependencies: LintCommandDependencies,
): Promise<number> {
  const parsed = parseLintArgs(tokens);
  const projectRoot = resolve(dependencies.cwd, parsed.projectPath ?? '.');

  try {
    const project = await loadEngineProject(projectRoot);
    const diagnostics: DiagnosticPayload[] = [];

    // 1. Session validation
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
            suggestions: ['Fix the session definition according to the error message'],
          })
        );
      }
    }

    // 2. Flow validation (already done by loadEngineProject via FlowLoader)
    // FlowLoader throws on validation errors, so if we got here, flows are valid

    // 3. Check for unused flows
    if (project.session) {
      const usedFlows = new Set<string>();
      for (const step of project.session.steps) {
        if ('flowRef' in step && step.flowRef) {
          usedFlows.add(step.flowRef);
        }
      }

      for (const flowId of Object.keys(project.flowsById)) {
        if (!usedFlows.has(flowId)) {
          diagnostics.push(
            buildCliDiagnostic({
              code: 'UNUSED_FLOW',
              message: `Flow "${flowId}" is not referenced by any session step`,
              file: `flow/${flowId}.json`,
              suggestions: [
                'Remove the flow file if it is no longer needed',
                'Add a session step that references this flow',
              ],
            })
          );
        }
      }
    }

    // 4. Check state key coverage in Branch conditions
    if (project.session) {
      const stateKeys = new Set(Object.keys(project.initialState));
      for (const step of project.session.steps) {
        if (step.type === 'Branch') {
          for (const condition of step.conditions) {
            // Extract state keys from condition (simple regex for state.xxx)
            const matches = condition.when.match(/state\.(\w+)/g);
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

    const payload: LintPayload = {
      project_root: projectRoot,
      diagnostics,
      summary: {
        total_issues: diagnostics.length,
        errors: diagnostics.filter((d) => d.code !== 'UNUSED_FLOW').length,
        warnings: diagnostics.filter((d) => d.code === 'UNUSED_FLOW').length,
      },
    };

    const exitCode = payload.summary.errors > 0 ? 1 : 0;
    const output = parsed.format === 'json'
      ? JSON.stringify(payload, null, 2)
      : renderPretty(payload);

    dependencies.io.stdout(output + '\n');
    return exitCode;
  } catch (error) {
    const diagnostic = buildCliDiagnostic({
      code: 'LINT_FAILED',
      message: error instanceof Error ? error.message : String(error),
      suggestions: ['Fix the project configuration and try again'],
    });

    const payload: LintPayload = {
      project_root: projectRoot,
      diagnostics: [diagnostic],
      summary: {
        total_issues: 1,
        errors: 1,
        warnings: 0,
      },
    };

    const output = parsed.format === 'json'
      ? JSON.stringify(payload, null, 2)
      : renderPretty(payload);

    dependencies.io.stderr(output + '\n');
    return 1;
  }
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
    const prefix = diagnostic.code === 'UNUSED_FLOW' ? '⚠' : '✗';
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
