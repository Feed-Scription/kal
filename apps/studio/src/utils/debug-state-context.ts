import type {
  FlowDefinition,
  NodeDefinition,
  ProjectState,
  SessionDefinition,
  SessionStep,
} from '@/types/project';

const STATE_REF_REGEX = /\bstate\.([A-Za-z0-9_]+)\b/g;
const DIRECT_STATE_FIELDS = new Set(['stateKey', 'historyKey', 'summaryKey', 'key']);
const ARRAY_STATE_FIELDS = new Set(['keys', 'allowedKeys']);

export type RelatedStateEntry = {
  key: string;
  type?: string;
  value: unknown;
  changed: boolean;
};

function collectFromUnknown(
  value: unknown,
  output: Set<string>,
  parentKey?: string,
): void {
  if (typeof value === 'string') {
    if (parentKey && DIRECT_STATE_FIELDS.has(parentKey) && value.trim()) {
      output.add(value.trim());
    }
    for (const match of value.matchAll(STATE_REF_REGEX)) {
      output.add(match[1]!);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (parentKey && ARRAY_STATE_FIELDS.has(parentKey)) {
      value.forEach((entry) => {
        if (typeof entry === 'string' && entry.trim()) {
          output.add(entry.trim());
        }
      });
      return;
    }
    value.forEach((entry) => collectFromUnknown(entry, output));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    collectFromUnknown(child, output, key);
  });
}

function collectFromSessionStep(step: SessionStep): string[] {
  const keys = new Set<string>();

  if ('stateKey' in step && step.stateKey) {
    keys.add(step.stateKey);
  }

  if (step.type === 'Branch') {
    step.conditions.forEach((condition) => {
      collectFromUnknown(condition.when, keys);
      if (condition.setState) {
        Object.keys(condition.setState).forEach((key) => keys.add(key));
      }
    });
    if (step.defaultSetState) {
      Object.keys(step.defaultSetState).forEach((key) => keys.add(key));
    }
  }

  collectFromUnknown(step, keys);
  return [...keys].sort();
}

function collectFromFlowNode(node: NodeDefinition): string[] {
  const keys = new Set<string>();
  collectFromUnknown(node.config ?? {}, keys);
  return [...keys].sort();
}

function collectFromFlowTrace(flow: FlowDefinition, executionOrder: string[]): string[] {
  const keys = new Set<string>();
  executionOrder.forEach((nodeId) => {
    const node = flow.data.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    collectFromFlowNode(node).forEach((key) => keys.add(key));
  });
  return [...keys].sort();
}

export function getSessionStepStateKeys(
  session: SessionDefinition | null,
  stepId: string | null | undefined,
): string[] {
  if (!session || !stepId) {
    return [];
  }

  const step = session.steps.find((candidate) => candidate.id === stepId);
  return step ? collectFromSessionStep(step) : [];
}

export function getFlowNodeStateKeys(
  flow: FlowDefinition | null,
  nodeId: string | null | undefined,
): string[] {
  if (!flow || !nodeId) {
    return [];
  }

  const node = flow.data.nodes.find((candidate) => candidate.id === nodeId);
  return node ? collectFromFlowNode(node) : [];
}

export function getFlowTraceStateKeys(
  flow: FlowDefinition | null,
  executionOrder: string[] | undefined,
): string[] {
  if (!flow || !executionOrder || executionOrder.length === 0) {
    return [];
  }

  return collectFromFlowTrace(flow, executionOrder);
}

export function buildRelatedStateEntries(
  state: ProjectState | Record<string, { type: string; value: unknown }> | undefined,
  keys: string[],
  changedKeys: Iterable<string>,
): RelatedStateEntry[] {
  const changed = new Set(changedKeys);

  return keys.map((key) => {
    const entry = state?.[key];
    return {
      key,
      type: entry?.type,
      value: entry?.value,
      changed: changed.has(key),
    };
  });
}

export function formatStatePreview(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 80 ? `${json.slice(0, 77)}...` : json;
  } catch {
    return String(value);
  }
}
