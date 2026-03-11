/**
 * Transform nodes: Regex, JSONParse, PostProcess, SubFlow
 */

import type { CustomNode } from '../../types/node';
import { repairJson } from '../../llm/json-repair';

export const Regex: CustomNode = {
  type: 'Regex',
  label: '正则匹配',
  category: 'transform',
  inputs: [
    { name: 'text', type: 'string', required: true },
  ],
  outputs: [
    { name: 'matches', type: 'array' },
    { name: 'groups', type: 'object' },
  ],
  configSchema: {
    type: 'object',
    required: ['pattern'],
    properties: {
      pattern: { type: 'string' },
      flags: { type: 'string' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    pattern: '',
    flags: 'g',
  },
  async execute(inputs, config) {
    const pattern = new RegExp(config.pattern, config.flags ?? '');
    const allMatches: string[] = [];
    const groups: Record<string, string> = {};

    if (config.flags?.includes('g')) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(inputs.text)) !== null) {
        allMatches.push(match[0]);
        if (match.groups) {
          Object.assign(groups, match.groups);
        }
      }
    } else {
      const match = pattern.exec(inputs.text);
      if (match) {
        allMatches.push(match[0]);
        if (match.groups) {
          Object.assign(groups, match.groups);
        }
      }
    }

    return { matches: allMatches, groups };
  },
};

export const JSONParse: CustomNode = {
  type: 'JSONParse',
  label: 'JSON 解析',
  category: 'transform',
  inputs: [
    { name: 'text', type: 'string', required: true },
  ],
  outputs: [
    { name: 'data', type: 'object' },
    { name: 'success', type: 'boolean' },
    { name: 'error', type: 'string' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      extractFromCodeBlock: { type: 'boolean' },
      fixCommonErrors: { type: 'boolean' },
      fixTruncated: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    extractFromCodeBlock: true,
    fixCommonErrors: true,
    fixTruncated: true,
  },
  async execute(inputs, config) {
    try {
      const data = repairJson(inputs.text, {
        extractFromCodeBlock: config.extractFromCodeBlock ?? true,
        fixCommonErrors: config.fixCommonErrors ?? true,
        fixTruncated: config.fixTruncated ?? true,
      });
      return { data, success: true, error: '' };
    } catch (error) {
      return { data: null, success: false, error: (error as Error).message };
    }
  },
};

type ProcessorDef = {
  type: 'trim' | 'replace' | 'slice' | 'toLowerCase' | 'toUpperCase';
  [key: string]: any;
};

export const PostProcess: CustomNode = {
  type: 'PostProcess',
  label: '后处理',
  category: 'transform',
  inputs: [
    { name: 'text', type: 'string', required: true },
  ],
  outputs: [
    { name: 'text', type: 'string' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      processors: { type: 'array' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    processors: [],
  },
  async execute(inputs, config) {
    let text: string = inputs.text;
    const processors: ProcessorDef[] = config.processors ?? [];

    for (const proc of processors) {
      switch (proc.type) {
        case 'trim':
          text = text.trim();
          break;
        case 'replace':
          text = text.replace(new RegExp(proc.pattern, proc.flags ?? 'g'), proc.replacement ?? '');
          break;
        case 'slice':
          text = text.slice(proc.start ?? 0, proc.end);
          break;
        case 'toLowerCase':
          text = text.toLowerCase();
          break;
        case 'toUpperCase':
          text = text.toUpperCase();
          break;
      }
    }

    return { text };
  },
};

export const SubFlow: CustomNode = {
  type: 'SubFlow',
  label: '子流程',
  category: 'transform',
  inputs: [],
  outputs: [],
  configSchema: {
    type: 'object',
    required: ['ref'],
    properties: {
      ref: { type: 'string' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    ref: '',
  },
  async execute(inputs, config, context) {
    const flowRef = config.ref;

    if (!flowRef) {
      context.logger.error('SubFlow node missing "ref" configuration');
      throw new Error('SubFlow node must have a "ref" field pointing to the sub-flow file');
    }

    if (!context.flow) {
      context.logger.error('SubFlow execution not available in context');
      throw new Error('Flow execution capability not available. SubFlow cannot be executed.');
    }

    context.logger.info('Executing SubFlow', { flowRef, inputs });

    try {
      const result = await context.flow.execute(flowRef, inputs);
      context.logger.info('SubFlow completed', { flowRef, result });
      return result;
    } catch (error) {
      context.logger.error('SubFlow execution failed', { flowRef, error: (error as Error).message });
      throw error;
    }
  },
};
