import { validateSessionDefinition } from '@kal-ai/core';
import type { SessionDefinition, SessionStep } from '@kal-ai/core';
import type { EngineRuntime } from '../../runtime';
import { EngineHttpError } from '../../errors';

export function cloneJson<T>(value: T): T {
  return structuredClone(value);
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
): Promise<SessionDefinition> {
  const session = getRequiredSession(runtime);
  const result = mutator(session) ?? session;
  await runtime.saveSession(result);
  return result;
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

export function validateSession(session: SessionDefinition, flowIds: string[]): {
  valid: boolean;
  diagnostics: Array<{ path: string; message: string }>;
} {
  const diagnostics = validateSessionDefinition(session, flowIds).map((error) => ({
    path: error.path,
    message: error.message,
  }));
  return {
    valid: diagnostics.length === 0,
    diagnostics,
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
