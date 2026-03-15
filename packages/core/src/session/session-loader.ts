/**
 * Session definition validator
 */

import type { SessionStep } from '../types/session';
import type { ConditionSpec } from '../expression/predicate';
import { validateConditionSpec } from '../expression/predicate';

export interface SessionValidationError {
  path: string;
  message: string;
}

// ── Shared validation helpers ──

function validateFlowRef(
  step: { flowRef?: string },
  prefix: string,
  flowIds: Set<string>,
  errors: SessionValidationError[],
): void {
  if (step.flowRef && !flowIds.has(step.flowRef)) {
    errors.push({ path: `${prefix}.flowRef`, message: `Flow not found: ${step.flowRef}` });
  }
}

function validateInputChannel(
  step: { flowRef?: string; inputChannel?: string },
  prefix: string,
  errors: SessionValidationError[],
): void {
  if (step.flowRef && (!step.inputChannel || typeof step.inputChannel !== 'string')) {
    errors.push({ path: `${prefix}.inputChannel`, message: 'inputChannel is required when flowRef is set' });
  }
  if (step.inputChannel && !step.flowRef) {
    errors.push({ path: `${prefix}.inputChannel`, message: 'inputChannel requires flowRef — flow cannot receive input without a flowRef' });
  }
}

function validateStateKey(
  step: { stateKey?: string },
  prefix: string,
  errors: SessionValidationError[],
): void {
  if (step.stateKey !== undefined && typeof step.stateKey !== 'string') {
    errors.push({ path: `${prefix}.stateKey`, message: 'stateKey must be a string' });
  }
}

function validateNext(
  step: { next: string },
  prefix: string,
  stepIds: Set<string>,
  errors: SessionValidationError[],
): void {
  if (!stepIds.has(step.next)) {
    errors.push({ path: `${prefix}.next`, message: `Step not found: ${step.next}` });
  }
}

function validateOptions(
  options: any[],
  prefix: string,
  errors: SessionValidationError[],
): void {
  for (let j = 0; j < options.length; j++) {
    const opt = options[j]!;
    if (!opt.label || typeof opt.label !== 'string') {
      errors.push({ path: `${prefix}[${j}].label`, message: 'label is required' });
    }
    if (!opt.value || typeof opt.value !== 'string') {
      errors.push({ path: `${prefix}[${j}].value`, message: 'value is required' });
    }
  }
}

function validateInteractiveStep(
  step: { flowRef?: string; stateKey?: string; inputChannel?: string },
  prefix: string,
  stepTypeName: string,
  flowIds: Set<string>,
  errors: SessionValidationError[],
): void {
  if (!step.flowRef && !step.stateKey) {
    errors.push({ path: `${prefix}.flowRef`, message: `${stepTypeName} step requires flowRef or stateKey` });
  }
  validateFlowRef(step, prefix, flowIds, errors);
  validateInputChannel(step, prefix, errors);
  validateStateKey(step, prefix, errors);
}

function validateConditionField(
  spec: ConditionSpec,
  path: string,
  errors: SessionValidationError[],
): void {
  const condErrors = validateConditionSpec(spec, path);
  errors.push(...condErrors);
}

function validateOptionsFromState(
  config: any,
  prefix: string,
  errors: SessionValidationError[],
): void {
  if (!config || typeof config !== 'object') {
    errors.push({ path: prefix, message: 'optionsFromState must be an object' });
    return;
  }
  if (!config.stateKey || typeof config.stateKey !== 'string') {
    errors.push({ path: `${prefix}.stateKey`, message: 'stateKey is required' });
  }
}

// ── Main validator ──

export function validateSessionDefinition(
  raw: unknown,
  availableFlowIds: string[],
  _options?: { initialStateKeys?: string[] },
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
  const validTypes = new Set(['RunFlow', 'Prompt', 'Branch', 'End', 'Choice', 'DynamicChoice']);
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
        validateFlowRef(step, prefix, flowIds, errors);
        validateNext(step, prefix, stepIds, errors);
        break;
      }
      case 'Prompt': {
        validateInteractiveStep(step, prefix, 'Prompt', flowIds, errors);
        validateNext(step, prefix, stepIds, errors);
        break;
      }
      case 'Branch': {
        if (!Array.isArray(step.conditions) || step.conditions.length === 0) {
          errors.push({ path: `${prefix}.conditions`, message: 'conditions must be a non-empty array' });
        } else {
          for (let j = 0; j < step.conditions.length; j++) {
            const cond = step.conditions[j]!;
            validateConditionField(cond.when, `${prefix}.conditions[${j}].when`, errors);
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
        validateInteractiveStep(step, prefix, 'Choice', flowIds, errors);
        if (!step.promptText || typeof step.promptText !== 'string') {
          errors.push({ path: `${prefix}.promptText`, message: 'promptText is required' });
        }
        if (!Array.isArray(step.options) || step.options.length === 0) {
          errors.push({ path: `${prefix}.options`, message: 'options must be a non-empty array' });
        } else {
          validateOptions(step.options, `${prefix}.options`, errors);
        }
        validateNext(step, prefix, stepIds, errors);
        break;
      }
      case 'DynamicChoice': {
        validateInteractiveStep(step, prefix, 'DynamicChoice', flowIds, errors);
        if (!step.promptText || typeof step.promptText !== 'string') {
          errors.push({ path: `${prefix}.promptText`, message: 'promptText is required' });
        }
        const hasOptionsFromState = !!(step as any).optionsFromState;
        if (hasOptionsFromState) {
          validateOptionsFromState((step as any).optionsFromState, `${prefix}.optionsFromState`, errors);
        }
        if (!Array.isArray(step.options) || (!hasOptionsFromState && step.options.length === 0)) {
          errors.push({ path: `${prefix}.options`, message: 'options must be a non-empty array' });
        } else {
          validateOptions(step.options, `${prefix}.options`, errors);
          for (let j = 0; j < step.options.length; j++) {
            const opt = step.options[j]!;
            if (opt.when !== undefined) {
              validateConditionField(opt.when, `${prefix}.options[${j}].when`, errors);
            }
          }
        }
        validateNext(step, prefix, stepIds, errors);
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
