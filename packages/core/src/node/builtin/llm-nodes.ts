/**
 * LLM nodes: PromptBuild, Message, GenerateText, GenerateImage
 */

import type { CustomNode } from '../../types/node';
import type { Fragment } from '../../prompt/fragments';
import { compose, estimateTokens, buildMessages, formatSection } from '../../prompt/compose';
import type { FormatType } from '../../prompt/compose';

export const PromptBuild: CustomNode = {
  type: 'PromptBuild',
  label: 'Prompt 构建',
  inputs: [
    { name: 'data', type: 'object', defaultValue: {} },
  ],
  outputs: [
    { name: 'text', type: 'string' },
    { name: 'estimatedTokens', type: 'number' },
  ],
  async execute(inputs, config) {
    const fragments: Fragment[] = config.fragments ?? [];
    const data = inputs.data ?? {};

    const segments = compose(fragments, data);
    const text = segments.join('\n\n');
    const tokens = estimateTokens(text);

    return { text, estimatedTokens: tokens };
  },
};

export const Message: CustomNode = {
  type: 'Message',
  label: '消息组装',
  inputs: [
    { name: 'system', type: 'string' },
    { name: 'user', type: 'string', required: true },
    { name: 'history', type: 'ChatMessage[]' },
  ],
  outputs: [
    { name: 'messages', type: 'ChatMessage[]' },
  ],
  async execute(inputs, config) {
    const format = config.format as FormatType | undefined;
    let system = inputs.system as string | undefined;
    let user = inputs.user as string;
    if (format && system) {
      system = formatSection('system', system, format);
    }
    if (format && user) {
      user = formatSection('user', user, format);
    }
    const messages = buildMessages({ system, user, history: inputs.history });
    return { messages };
  },
};

export const GenerateText: CustomNode = {
  type: 'GenerateText',
  label: '生成文本',
  inputs: [
    { name: 'messages', type: 'ChatMessage[]', required: true },
  ],
  outputs: [
    { name: 'text', type: 'string' },
    { name: 'usage', type: 'object' },
  ],
  async execute(inputs, config, context) {
    const result = await context.llm.invoke(inputs.messages, {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      retry: config.retry,
      cache: config.cache,
    });
    return { text: result.text, usage: result.usage };
  },
};

export const GenerateImage: CustomNode = {
  type: 'GenerateImage',
  label: '生成图像',
  inputs: [
    { name: 'prompt', type: 'string', required: true },
  ],
  outputs: [
    { name: 'imageUrl', type: 'ImageUrl' },
  ],
  async execute(inputs, config, context) {
    context.logger.info('GenerateImage called', { prompt: inputs.prompt, model: config.model });
    return {
      imageUrl: {
        url: `generated://${config.model ?? 'default'}?prompt=${encodeURIComponent(inputs.prompt)}`,
        alt: inputs.prompt,
      },
    };
  },
};
