/**
 * Default config for each session step type.
 * Used when creating new steps via the context menu.
 */

export type SessionStepDefaults = {
  label: string;
  config: Record<string, unknown>;
};

export const SESSION_STEP_DEFAULTS: Record<string, SessionStepDefaults> = {
  RunFlow: {
    label: '执行 Flow',
    config: { flowRef: '', next: '' },
  },
  Prompt: {
    label: '等待输入',
    config: { flowRef: '', inputChannel: 'user_input', stateKey: '', promptText: '', next: '' },
  },
  Branch: {
    label: '条件分支',
    config: { conditions: [], default: '' },
  },
  End: {
    label: '结束',
    config: { message: '' },
  },
  Choice: {
    label: '选择题',
    config: { flowRef: '', inputChannel: 'choice', stateKey: '', promptText: '', options: [], next: '' },
  },
};
