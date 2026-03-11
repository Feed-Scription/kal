/**
 * Session definition validator
 */

import type { SessionStep } from '../types/session';
import { parseCondition } from './condition-evaluator';

export interface SessionValidationError {
  path: string;
  message: string;
}

export function validateSessionDefinition(
  raw: unknown,
  availableFlowIds: string[],
): SessionValidationError[] {
  const errors: SessionValidationError[] = [];
  if (!raw || typeof raw !== 'object') {
    errors.push({ path: '', message: 'Session definition must be an object' });
    return errors;
  }

  const def = raw as Record<string, unknown>;

  if (typeof def.schemaVersion !== 'string') {
    errors.push({ path: 'schemaVersion', message: 'schemaVersion is required and must be a string' });
  }

  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    errors.push({ path: 'steps', message: 'steps must be a non-empty array' });
    return errors;
  }

  const steps = def.steps as SessionStep[];
  const stepIds = new Set(steps.map((s) => s.id));
  const flowIds = new Set(availableFlowIds);
  const validTypes = new Set(['RunFlow', 'Prompt', 'Branch', 'End', 'Choice']);
  let hasEnd = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const prefix = `steps[${i}]`;

    if (!step.id || typeof step.id !== 'string') {
      errors.push({ path: `${prefix}.id`, message: 'step id is required' });
      continue;
    }

    if (!validTypes.has(step.type)) {
      errors.push({ path: `${prefix}.type`, message: `Invalid step type: ${step.type}` });
      continue;
    }

    switch (step.type) {
      case 'RunFlow': {
        if (!flowIds.has(step.flowRef)) {
          errors.push({ path: `${prefix}.flowRef`, message: `Flow not found: ${step.flowRef}` });
        }
        if (!stepIds.has(step.next)) {
          errors.push({ path: `${prefix}.next`, message: `Step not found: ${step.next}` });
        }
        break;
      }
      case 'Prompt': {
        if (!step.flowRef && !step.stateKey) {
          errors.push({ path: `${prefix}.flowRef`, message: 'Prompt step requires flowRef or stateKey' });
        }
        if (step.flowRef && !flowIds.has(step.flowRef)) {
          errors.push({ path: `${prefix}.flowRef`, message: `Flow not found: ${step.flowRef}` });
        }
        if (step.flowRef && (!step.inputChannel || typeof step.inputChannel !== 'string')) {
          errors.push({ path: `${prefix}.inputChannel`, message: 'inputChannel is required when flowRef is set' });
        }
        if (step.stateKey !== undefined && typeof step.stateKey !== 'string') {
          errors.push({ path: `${prefix}.stateKey`, message: 'stateKey must be a string' });
        }
        if (!stepIds.has(step.next)) {
          errors.push({ path: `${prefix}.next`, message: `Step not found: ${step.next}` });
        }
        break;
      }
      case 'Branch': {
        if (!Array.isArray(step.conditions) || step.conditions.length === 0) {
          errors.push({ path: `${prefix}.conditions`, message: 'conditions must be a non-empty array' });
        } else {
          for (let j = 0; j < step.conditions.length; j++) {
            const cond = step.conditions[j]!;
            try {
              parseCondition(cond.when);
            } catch (e) {
              errors.push({
                path: `${prefix}.conditions[${j}].when`,
                message: (e as Error).message,
              });
            }
            if (!stepIds.has(cond.next)) {
              errors.push({
                path: `${prefix}.conditions[${j}].next`,
                message: `Step not found: ${cond.next}`,
              });
            }
          }
        }
        if (!stepIds.has(step.default)) {
          errors.push({ path: `${prefix}.default`, message: `Step not found: ${step.default}` });
        }
        break;
      }
      case 'End': {
        hasEnd = true;
        break;
      }
      case 'Choice': {
        if (!step.flowRef && !step.stateKey) {
          errors.push({ path: `${prefix}.flowRef`, message: 'Choice step requires flowRef or stateKey' });
        }
        if (step.flowRef && !flowIds.has(step.flowRef)) {
          errors.push({ path: `${prefix}.flowRef`, message: `Flow not found: ${step.flowRef}` });
        }
        if (step.flowRef && (!step.inputChannel || typeof step.inputChannel !== 'string')) {
          errors.push({ path: `${prefix}.inputChannel`, message: 'inputChannel is required when flowRef is set' });
        }
        if (step.stateKey !== undefined && typeof step.stateKey !== 'string') {
          errors.push({ path: `${prefix}.stateKey`, message: 'stateKey must be a string' });
        }
        if (!step.promptText || typeof step.promptText !== 'string') {
          errors.push({ path: `${prefix}.promptText`, message: 'promptText is required' });
        }
        if (!Array.isArray(step.options) || step.options.length === 0) {
          errors.push({ path: `${prefix}.options`, message: 'options must be a non-empty array' });
        } else {
          for (let j = 0; j < step.options.length; j++) {
            const opt = step.options[j]!;
            if (!opt.label || typeof opt.label !== 'string') {
              errors.push({ path: `${prefix}.options[${j}].label`, message: 'label is required' });
            }
            if (!opt.value || typeof opt.value !== 'string') {
              errors.push({ path: `${prefix}.options[${j}].value`, message: 'value is required' });
            }
          }
        }
        if (!stepIds.has(step.next)) {
          errors.push({ path: `${prefix}.next`, message: `Step not found: ${step.next}` });
        }
        break;
      }
    }
  }

  if (!hasEnd) {
    errors.push({ path: 'steps', message: 'Session must have at least one End step' });
  }

  if (def.entryStep && typeof def.entryStep === 'string' && !stepIds.has(def.entryStep)) {
    errors.push({ path: 'entryStep', message: `Entry step not found: ${def.entryStep}` });
  }

  return errors;
}
