import type { CustomNode } from '@kal-ai/core';

const PresetCharacter: CustomNode = {
  type: 'PresetCharacter',
  label: '预设角色',
  category: 'transform',
  inputs: [
    { name: 'presetId', type: 'string', required: true },
  ],
  outputs: [
    { name: 'name', type: 'string' },
    { name: 'race', type: 'string' },
    { name: 'class', type: 'string' },
    { name: 'background', type: 'string' },
    { name: 'createMode', type: 'string' },
  ],
  configSchema: {
    type: 'object',
    required: ['presets'],
    properties: {
      presets: { type: 'object' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    presets: {},
  },
  async execute(inputs, config) {
    const presets = (config.presets ?? {}) as Record<string, Record<string, string>>;
    const preset = presets[inputs.presetId];
    if (!preset) {
      return { name: '', race: '', class: '', background: '', createMode: inputs.presetId };
    }
    return {
      name: preset.name ?? '',
      race: preset.race ?? '',
      class: preset.class ?? '',
      background: preset.background ?? '',
      createMode: inputs.presetId,
    };
  },
};

export default PresetCharacter;
