import { renderPrompt } from '@kal-ai/core';
import type { EngineRuntime } from './runtime';

type PromptPreviewBinding = {
  key: string;
  value: string;
};

export type PromptPreviewEntry = {
  id: string;
  source: 'session-step' | 'flow-node';
  resourceId: string;
  title: string;
  subtitle: string;
  promptText: string;
  bindings: PromptPreviewBinding[];
  flowId?: string;
  nodeId?: string;
  stepId?: string;
  rendered?: ReturnType<typeof renderPrompt>;
};

function pushBinding(bindings: PromptPreviewBinding[], key: string, value: string | undefined): void {
  if (!value || !value.trim()) {
    return;
  }
  bindings.push({ key, value });
}

function collectPromptBindings(
  value: unknown,
  prefix = '',
  bindings: PromptPreviewBinding[] = [],
): PromptPreviewBinding[] {
  if (typeof value === 'string') {
    if (/(prompt|template|message|instruction|system|user|content)/i.test(prefix)) {
      pushBinding(bindings, prefix, value);
    }
    return bindings;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectPromptBindings(entry, prefix ? `${prefix}[${index}]` : `[${index}]`, bindings);
    });
    return bindings;
  }

  if (!value || typeof value !== 'object') {
    return bindings;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    collectPromptBindings(child, nextPrefix, bindings);
  });

  return bindings;
}

export function buildPromptPreviewEntries(runtime: EngineRuntime): PromptPreviewEntry[] {
  const entries: PromptPreviewEntry[] = [];
  const session = runtime.getSession();

  if (session) {
    for (const step of session.steps) {
      if (step.type !== 'Prompt' && step.type !== 'Choice' && step.type !== 'DynamicChoice') {
        continue;
      }

      const bindings: PromptPreviewBinding[] = [];
      if ('flowRef' in step) {
        pushBinding(bindings, 'flowRef', step.flowRef);
      }
      if ('inputChannel' in step) {
        pushBinding(bindings, 'inputChannel', step.inputChannel);
      }
      if ('stateKey' in step) {
        pushBinding(bindings, 'stateKey', step.stateKey);
      }
      if ('options' in step && Array.isArray(step.options)) {
        step.options.forEach((option, index) => {
          pushBinding(bindings, `options[${index}]`, `${option.label} => ${option.value}`);
        });
      }

      entries.push({
        id: `session:${step.id}`,
        source: 'session-step',
        resourceId: 'session://default',
        title: step.id,
        subtitle: `${step.type} step`,
        promptText: step.promptText || '',
        bindings,
        stepId: step.id,
      });
    }
  }

  const state = runtime.getState();
  for (const [flowId, flow] of Object.entries(runtime.getProject().flowsById)) {
    for (const node of flow.data.nodes) {
      if (node.type === 'PromptBuild') {
        const rendered = renderPrompt(node.id, node.config?.fragments ?? [], state);
        const bindings = collectPromptBindings(node.config ?? {});
        entries.push({
          id: `flow:${flowId}:${node.id}`,
          source: 'flow-node',
          resourceId: `flow://${flowId}`,
          title: node.label || node.id,
          subtitle: `${flowId} / ${node.type}`,
          promptText: rendered.renderedText || '',
          bindings,
          flowId,
          nodeId: node.id,
          rendered,
        });
        continue;
      }

      const bindings = collectPromptBindings(node.config ?? {});
      if (bindings.length === 0) {
        continue;
      }

      const promptText = bindings
        .slice(0, 4)
        .map((binding) => `${binding.key}: ${binding.value}`)
        .join('\n');

      entries.push({
        id: `flow:${flowId}:${node.id}`,
        source: 'flow-node',
        resourceId: `flow://${flowId}`,
        title: node.label || node.id,
        subtitle: `${flowId} / ${node.type}`,
        promptText,
        bindings,
        flowId,
        nodeId: node.id,
      });
    }
  }

  return entries;
}
