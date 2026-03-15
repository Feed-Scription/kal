/**
 * Session materializer — renders session steps into concrete interaction content.
 * Unifies the rendering path for Prompt, Choice, and DynamicChoice steps.
 */

import type { ValueReader } from '../expression/reader';
import { interpolateTemplate, resolvePath } from '../expression/reader';
import { evaluateCondition } from '../expression/predicate';
import type { ConditionSpec } from '../expression/predicate';
import type { ChoiceStep, DynamicChoiceStep, PromptStep } from '../types/session';
import type { SessionWaitingFor } from './session-runner';

export class NoVisibleOptionsError extends Error {
  constructor(public stepId: string) {
    super(`DynamicChoice has no visible options`);
    this.name = 'NoVisibleOptionsError';
  }
}

/**
 * Materialize an interactive step into a SessionWaitingFor.
 * Unified entry point for Prompt / Choice / DynamicChoice.
 */
export function materializeWaitingFor(
  step: PromptStep | ChoiceStep | DynamicChoiceStep,
  reader: ValueReader,
): SessionWaitingFor {
  if (step.type === 'Prompt') {
    return {
      kind: 'prompt',
      stepId: step.id,
      promptText: renderPromptText(step.promptText, reader),
    };
  }

  const options = materializeChoiceOptions(step, reader);

  if (options.length === 0) {
    throw new NoVisibleOptionsError(step.id);
  }

  return {
    kind: 'choice',
    stepId: step.id,
    promptText: renderPromptText(step.promptText, reader),
    options,
  };
}

function renderPromptText(text: string | undefined, reader: ValueReader): string | undefined {
  if (!text) return text;
  return interpolateTemplate(text, reader);
}

function materializeChoiceOptions(
  step: ChoiceStep | DynamicChoiceStep,
  reader: ValueReader,
): Array<{ label: string; value: string }> {
  let result: Array<{ label: string; value: string }> = [];

  // 1. Dynamic options from state array
  if ('optionsFromState' in step && step.optionsFromState) {
    result.push(...resolveOptionsFromState(step.optionsFromState, reader));
  }

  // 2. Static options (DynamicChoice filters by when, Choice uses directly)
  if (step.type === 'DynamicChoice') {
    const filtered = step.options.filter((opt) => {
      if (!opt.when) return true;
      return evaluateCondition(opt.when as ConditionSpec, reader, { mode: 'strict' });
    });
    result.push(...filtered.map((opt) => ({ label: opt.label, value: opt.value })));
  } else {
    result.push(...step.options);
  }

  // 3. Interpolate all labels
  result = result.map((opt) => ({
    label: interpolateTemplate(opt.label, reader),
    value: opt.value,
  }));

  return result;
}

function resolveOptionsFromState(
  config: NonNullable<DynamicChoiceStep['optionsFromState']>,
  reader: ValueReader,
): Array<{ label: string; value: string }> {
  const arr = resolvePath(reader, `state.${config.stateKey}`);
  if (!Array.isArray(arr)) return [];

  const labelField = config.labelField ?? 'label';
  const valueField = config.valueField ?? 'value';
  const whenField = config.whenField;

  return arr
    .filter((item: any) => {
      if (!whenField || !item[whenField]) return true;
      return !!item[whenField];
    })
    .map((item: any) => ({
      label: typeof item === 'string' ? item : String(item[labelField] ?? item),
      value: typeof item === 'string' ? item : String(item[valueField] ?? item),
    }));
}
