/**
 * LLM nodes: PromptBuild, Message, GenerateText, GenerateImage
 */

import type { CustomNode } from '../../types/node';
import type { ChatMessage } from '../../types/types';
import type { Fragment } from '../../prompt/fragments';
import { compose, composeMessages, formatSection, estimateTokens } from '../../prompt/compose';
import type { FormatType } from '../../prompt/compose';

function extractAssistantContent(text: string, assistantPath?: string): string {
  if (!assistantPath) {
    return text;
  }

  try {
    let current: unknown = JSON.parse(text);
    for (const part of assistantPath.split('.')) {
      if (!part || current == null || typeof current !== 'object' || !(part in current)) {
        return text;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : text;
  } catch {
    return text;
  }
}

export const PromptBuild: CustomNode = {
  type: 'PromptBuild',
  label: 'Prompt 构建',
  category: 'llm',
  inputs: [
    { name: 'data', type: 'object', defaultValue: {} },
  ],
  outputs: [
    { name: 'messages', type: 'ChatMessage[]' },
    { name: 'text', type: 'string' },
    { name: 'estimatedTokens', type: 'number' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      defaultRole: {
        type: 'string',
        enum: ['system', 'user', 'assistant'],
      },
      fragments: {
        type: 'array',
      },
    },
    additionalProperties: true,
  },
  defaultConfig: {
    defaultRole: 'system',
    fragments: [],
  },
  async execute(inputs, config, context) {
    const fragments: Fragment[] = config.fragments ?? [];
    const scope = {
      data: inputs.data ?? {},
      state: context.state,
    };
    const text = compose(fragments, scope);
    const messages = composeMessages(fragments, scope, {
      defaultRole: config.defaultRole ?? 'system',
    });

    return {
      messages,
      text,
      estimatedTokens: estimateTokens(text),
    };
  },
};

export const Message: CustomNode = {
  type: 'Message',
  label: '消息组装',
  category: 'llm',
  inputs: [
    { name: 'system', type: 'string' },
    { name: 'context', type: 'string' },
    { name: 'user', type: 'string' },
  ],
  outputs: [
    { name: 'messages', type: 'ChatMessage[]' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['xml', 'markdown'],
      },
      historyKey: {
        type: 'string',
      },
      maxHistoryMessages: {
        type: 'number',
      },
      summaryKey: {
        type: 'string',
      },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    system: '',
    user: '',
    format: 'xml',
  },
  async execute(inputs, config, context) {
    const format = config.format as FormatType | undefined;
    const historyKey = config.historyKey ?? 'history';
    let system = inputs.system as string | undefined;
    let userContext = inputs.context as string | undefined;
    let user = inputs.user as string | undefined;

    const historyState = context.state.get(historyKey);
    if (historyState && historyState.type !== 'array') {
      throw new Error(`History state "${historyKey}" must be an array`);
    }

    let history = (historyState?.value as ChatMessage[] | undefined) ?? [];
    if (typeof config.maxHistoryMessages === 'number') {
      history = history.slice(-config.maxHistoryMessages);
    }

    if (format && system) {
      system = formatSection('system', system, format);
    }
    if (format && userContext) {
      userContext = formatSection('context', userContext, format);
    }
    if (format && user) {
      user = formatSection('user', user, format);
    }

    // If context is provided, prepend it to user message for prefix caching
    if (userContext && user) {
      user = userContext + '\n\n' + user;
    }

    const messages: ChatMessage[] = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }

    // 如果配置了 summaryKey 且 state 中有摘要，在 history 前插入摘要
    if (config.summaryKey) {
      const summaryState = context.state.get(config.summaryKey as string);
      if (summaryState && summaryState.value) {
        messages.push({ role: 'system', content: summaryState.value as string });
      }
    }

    messages.push(...history);

    // Only add user message if provided
    if (user) {
      messages.push({ role: 'user', content: user });
    } else if (messages.length > 0 && messages[messages.length - 1]!.role !== 'user') {
      // Some LLM providers require a user message; add a minimal trigger
      messages.push({ role: 'user', content: '请根据以上信息生成回复。' });
    }

    return { messages };
  },
};

export const GenerateText: CustomNode = {
  type: 'GenerateText',
  label: '生成文本',
  category: 'llm',
  inputs: [
    { name: 'messages', type: 'ChatMessage[]', required: true },
    { name: 'historyUserMessage', type: 'string' },
  ],
  outputs: [
    { name: 'text', type: 'string' },
    { name: 'usage', type: 'object' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      model: { type: 'string' },
      temperature: { type: 'number' },
      maxTokens: { type: 'number' },
      historyKey: { type: 'string' },
      historyPolicy: {
        type: 'object',
        properties: {
          maxMessages: { type: 'number' },
        },
        additionalProperties: false,
      },
      assistantPath: { type: 'string' },
      responseFormat: { type: 'string', enum: ['text', 'json'] },
      jsonSchema: { type: 'object' },
    },
    additionalProperties: true,
  },
  defaultConfig: {
    model: '',
    temperature: 0.7,
    maxTokens: 2000,
    historyKey: 'history',
    assistantPath: '',
  },
  async execute(inputs, config, context) {
    let messages = inputs.messages as ChatMessage[];
    // Some LLM providers require at least one user message
    if (messages.length > 0 && !messages.some((m) => m.role === 'user')) {
      messages = [...messages, { role: 'user', content: '请根据以上信息生成回复。' }];
    }
    const result = await context.llm.invoke(messages, {
      model: config.model || undefined,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      retry: config.retry,
      cache: config.cache,
      responseFormat: config.responseFormat as 'text' | 'json' | undefined,
      jsonSchema: config.jsonSchema as object | undefined,
    });

    const historyKey = config.historyKey ?? 'history';

    // 如果 historyKey 为空字符串，跳过 history 写入
    if (historyKey !== '') {
      const historyState = context.state.get(historyKey);
      if (!historyState) {
        context.state.set(historyKey, { type: 'array', value: [] });
      } else if (historyState.type !== 'array') {
        throw new Error(`History state "${historyKey}" must be an array`);
      }

      const latestUserMessage = [...(inputs.messages as ChatMessage[])].reverse().find((message) => message.role === 'user');
      const historyUserMessage =
        typeof inputs.historyUserMessage === 'string' ? inputs.historyUserMessage : latestUserMessage?.content;
      const assistantContent = extractAssistantContent(result.text, config.assistantPath as string | undefined);
      if (historyUserMessage) {
        context.state.appendMany(historyKey, [
          { role: 'user', content: historyUserMessage },
          { role: 'assistant', content: assistantContent },
        ]);
      } else {
        context.state.append(historyKey, { role: 'assistant', content: assistantContent });
      }

      const historyLimit = config.historyPolicy?.maxMessages;
      if (typeof historyLimit === 'number') {
        const nextHistory = context.state.get(historyKey);
        if (nextHistory?.type === 'array') {
          const values = nextHistory.value as unknown as ChatMessage[];
          if (values.length > historyLimit) {
            context.state.set(historyKey, {
              type: 'array',
              value: values.slice(-historyLimit) as unknown as any,
            });
          }
        }
      }
    }

    return { text: result.text, usage: result.usage };
  },
};

export const UpdateHistory: CustomNode = {
  type: 'UpdateHistory',
  label: '更新历史',
  category: 'llm',
  inputs: [
    { name: 'userMessage', type: 'string', required: true },
    { name: 'assistantMessage', type: 'string', required: true },
  ],
  outputs: [
    { name: 'success', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      historyKey: { type: 'string' },
      assistantPath: { type: 'string' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    historyKey: 'history',
    assistantPath: '',
  },
  async execute(inputs, config, context) {
    const historyKey = (config.historyKey as string) || 'history';
    const assistantPath = config.assistantPath as string | undefined;

    let assistantContent = inputs.assistantMessage as string;

    // 如果配置了 assistantPath，尝试从 JSON 中提取指定字段
    if (assistantPath) {
      try {
        const parsed = JSON.parse(assistantContent);
        const value = parsed[assistantPath];
        if (typeof value === 'string') {
          assistantContent = value;
        }
      } catch {
        // 解析失败则使用原始文本
      }
    }

    const historyState = context.state.get(historyKey);
    if (!historyState) {
      context.state.set(historyKey, { type: 'array', value: [] });
    } else if (historyState.type !== 'array') {
      throw new Error(`History state "${historyKey}" must be an array`);
    }

    context.state.appendMany(historyKey, [
      { role: 'user', content: inputs.userMessage as string },
      { role: 'assistant', content: assistantContent },
    ]);

    return { success: true };
  },
};

export const CompactHistory: CustomNode = {
  type: 'CompactHistory',
  label: '压缩历史',
  category: 'llm',
  inputs: [
    { name: 'summary', type: 'string', required: true },
  ],
  outputs: [
    { name: 'success', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      historyKey: { type: 'string' },
      summaryKey: { type: 'string' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    historyKey: 'history',
    summaryKey: 'summary',
  },
  async execute(inputs, config, context) {
    const historyKey = (config.historyKey as string) || 'history';
    const summaryKey = (config.summaryKey as string) || 'summary';

    // 保存摘要
    const summaryState = context.state.get(summaryKey);
    if (!summaryState) {
      context.state.set(summaryKey, { type: 'string', value: inputs.summary });
    } else {
      context.state.set(summaryKey, { type: summaryState.type, value: inputs.summary });
    }

    // 清空历史
    const historyState = context.state.get(historyKey);
    if (historyState) {
      context.state.set(historyKey, { type: historyState.type, value: [] });
    }

    return { success: true };
  },
};

export const GenerateImage: CustomNode = {
  type: 'GenerateImage',
  label: '生成图像',
  category: 'llm',
  inputs: [
    { name: 'prompt', type: 'string', required: true },
  ],
  outputs: [
    { name: 'imageUrl', type: 'ImageUrl' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      model: { type: 'string' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    model: 'dall-e-3',
  },
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
