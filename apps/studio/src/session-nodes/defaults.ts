/**
 * Default config for each session step type.
 * Used when creating new steps via the context menu.
 */

import i18n from '@/i18n';

export type SessionStepDefaults = {
  label: string;
  config: Record<string, unknown>;
};

export function getSessionStepDefaults(): Record<string, SessionStepDefaults> {
  return {
    RunFlow: {
      label: i18n.t('session:defaults.RunFlow'),
      config: { flowRef: '', next: '' },
    },
    Prompt: {
      label: i18n.t('session:defaults.Prompt'),
      config: { flowRef: '', inputChannel: 'user_input', stateKey: '', promptText: '', next: '' },
    },
    Branch: {
      label: i18n.t('session:defaults.Branch'),
      config: { conditions: [], default: '' },
    },
    End: {
      label: i18n.t('session:defaults.End'),
      config: { message: '' },
    },
    Choice: {
      label: i18n.t('session:defaults.Choice'),
      config: { flowRef: '', inputChannel: 'choice', stateKey: '', promptText: '', options: [], next: '' },
    },
    DynamicChoice: {
      label: i18n.t('session:defaults.DynamicChoice'),
      config: {
        flowRef: '',
        inputChannel: 'choice',
        stateKey: '',
        promptText: '',
        options: [],
        optionsFromState: undefined,
        next: '',
      },
    },
  };
}

/** @deprecated Use getSessionStepDefaults() for i18n-aware labels */
export const SESSION_STEP_DEFAULTS: Record<string, SessionStepDefaults> = new Proxy({} as Record<string, SessionStepDefaults>, {
  get(_target, prop: string) {
    return getSessionStepDefaults()[prop];
  },
  ownKeys() {
    return Object.keys(getSessionStepDefaults());
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    const defaults = getSessionStepDefaults();
    if (prop in defaults) {
      return { configurable: true, enumerable: true, value: defaults[prop] };
    }
    return undefined;
  },
});
