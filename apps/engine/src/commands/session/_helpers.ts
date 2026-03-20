import { validateSessionDefinitionDetailed } from '@kal-ai/core';
import type {
  SessionDefinition,
  SessionFlowValidationMode,
  SessionStep,
  SessionValidationError,
} from '@kal-ai/core';
import type { EngineRuntime } from '../../runtime';
import { EngineHttpError } from '../../errors';

export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

export const flowCheckArg = {
  type: 'string' as const,
  description: 'How to handle missing session step flowRef targets: strict, warn, or ignore',
  default: 'warn',
};

export const skipFlowCheckArg = {
  type: 'boolean' as const,
  description: 'Compatibility alias for --flow-check ignore',
  default: false,
};

export function resolveFlowValidationMode(args: {
  'flow-check'?: unknown;
  'skip-flow-check'?: unknown;
}, defaultMode: SessionFlowValidationMode = 'warn'): SessionFlowValidationMode {
  if (args['skip-flow-check'] === true) {
    return 'ignore';
  }
  const rawMode = typeof args['flow-check'] === 'string' ? args['flow-check'] : defaultMode;
  if (rawMode === 'strict' || rawMode === 'warn' || rawMode === 'ignore') {
    return rawMode;
  }
  throw new EngineHttpError(
    `Invalid --flow-check value: ${rawMode}`,
    400,
    'FLOW_CHECK_MODE_INVALID',
    { value: rawMode },
  );
}

export function formatSessionWarnings(warnings: SessionValidationError[]): string[] {
  return warnings.map((warning) =>
    warning.path ? `${warning.path}: ${warning.message}` : warning.message
  );
}

export function getRequiredSession(runtime: EngineRuntime): SessionDefinition {
  const session = runtime.getSession();
  if (!session) {
    throw new EngineHttpError('Project has no session.json', 404, 'NO_SESSION');
  }
  return cloneJson(session);
}

export async function mutateSession(
  runtime: EngineRuntime,
  mutator: (session: SessionDefinition) => SessionDefinition | void,
  options: { flowValidationMode?: SessionFlowValidationMode } = {},
): Promise<{ session: SessionDefinition; warnings: string[] }> {
  const session = getRequiredSession(runtime);
  const result = mutator(session) ?? session;
  const saveResult = await runtime.saveSession(result, {
    flowValidationMode: options.flowValidationMode ?? 'warn',
  });
  return {
    session: result,
    warnings: formatSessionWarnings(saveResult.warnings),
  };
}

export function findStepIndex(session: SessionDefinition, stepId: string): number {
  const index = session.steps.findIndex((step) => step.id === stepId);
  if (index === -1) {
    throw new EngineHttpError(`Step not found: ${stepId}`, 404, 'STEP_NOT_FOUND', { stepId });
  }
  return index;
}

export function getStep(session: SessionDefinition, stepId: string): SessionStep {
  return session.steps[findStepIndex(session, stepId)]!;
}

export function summarizeStep(step: SessionStep): Record<string, unknown> {
  return {
    id: step.id,
    type: step.type,
    next: 'next' in step ? step.next : undefined,
    flowRef: 'flowRef' in step ? step.flowRef : undefined,
  };
}

export function validateSession(
  session: SessionDefinition,
  flowIds: string[],
  options: { flowValidationMode?: SessionFlowValidationMode } = {},
): {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
  diagnostics: Array<{ path: string; message: string; severity: 'error' | 'warning' }>;
} {
  const result = validateSessionDefinitionDetailed(session, flowIds, {
    flowValidationMode: options.flowValidationMode ?? 'warn',
  });
  const errors = result.errors.map((error) => ({
    path: error.path,
    message: error.message,
  }));
  const warnings = result.warnings.map((warning) => ({
    path: warning.path,
    message: warning.message,
  }));
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    diagnostics: [
      ...errors.map((error) => ({ ...error, severity: 'error' as const })),
      ...warnings.map((warning) => ({ ...warning, severity: 'warning' as const })),
    ],
  };
}

export function collectRemovalWarnings(session: SessionDefinition, stepId: string): string[] {
  const warnings: string[] = [];

  for (const step of session.steps) {
    if ('next' in step && step.next === stepId) {
      warnings.push(`Step "${step.id}" next points to "${stepId}"`);
    }
    if (step.type === 'Branch') {
      if (step.default === stepId) {
        warnings.push(`Step "${step.id}" default points to "${stepId}"`);
      }
      for (const condition of step.conditions) {
        if (condition.next === stepId) {
          warnings.push(`Step "${step.id}" branch condition points to "${stepId}"`);
        }
      }
    }
  }

  return warnings;
}
