/**
 * Reference Graph + Search — Kernel 职责 #3
 *
 * 纯函数模块，接收 EngineProject，返回引用索引和搜索索引。
 * 复用 lint.ts 的 state key 提取逻辑。
 */

import type { EngineProject } from './types';

// ── Types ──

export type ReferenceKind =
  | 'session-step->flow'
  | 'session-step->state-key'
  | 'flow-node->node-type'
  | 'flow-edge->node'
  | 'session-step->step';

export type ReferenceEntry = {
  kind: ReferenceKind;
  sourceResource: string;
  sourceId: string;
  targetResource: string;
  targetId: string;
  location?: string;
};

export type SearchEntry = {
  resourceId: string;
  resourceType: string;
  id: string;
  field: string;
  text: string;
};

export type SearchResult = {
  query: string;
  matches: Array<SearchEntry & { score: number }>;
};

// ── Reference Index ──

const STATE_KEY_REGEX = /state\.(\w+)/g;

export function buildReferenceIndex(project: EngineProject): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];

  // Session step references
  if (project.session) {
    for (const step of project.session.steps) {
      // flowRef → flow resource
      if ('flowRef' in step && step.flowRef) {
        entries.push({
          kind: 'session-step->flow',
          sourceResource: 'session://default',
          sourceId: step.id,
          targetResource: `flow://${step.flowRef}`,
          targetId: step.flowRef,
          location: `steps[id=${step.id}].flowRef`,
        });
      }

      // stateKey → state key
      if ('stateKey' in step && step.stateKey) {
        entries.push({
          kind: 'session-step->state-key',
          sourceResource: 'session://default',
          sourceId: step.id,
          targetResource: 'state://project',
          targetId: step.stateKey,
          location: `steps[id=${step.id}].stateKey`,
        });
      }

      // Branch conditions referencing state keys
      if (step.type === 'Branch') {
        for (const condition of step.conditions) {
          const when = typeof condition.when === 'string' ? condition.when : '';
          for (const match of when.matchAll(STATE_KEY_REGEX)) {
            entries.push({
              kind: 'session-step->state-key',
              sourceResource: 'session://default',
              sourceId: step.id,
              targetResource: 'state://project',
              targetId: match[1]!,
              location: `steps[id=${step.id}].conditions`,
            });
          }
        }
      }

      // next → step reference
      if ('next' in step && step.next) {
        entries.push({
          kind: 'session-step->step',
          sourceResource: 'session://default',
          sourceId: step.id,
          targetResource: 'session://default',
          targetId: step.next,
        });
      }
    }
  }

  // Flow node and edge references
  for (const [flowId, flow] of Object.entries(project.flowsById)) {
    const flowResource = `flow://${flowId}`;

    for (const node of flow.data.nodes) {
      entries.push({
        kind: 'flow-node->node-type',
        sourceResource: flowResource,
        sourceId: node.id,
        targetResource: 'node-type://' + node.type,
        targetId: node.type,
      });
    }

    for (const edge of flow.data.edges) {
      entries.push({
        kind: 'flow-edge->node',
        sourceResource: flowResource,
        sourceId: `${edge.source}:${edge.sourceHandle}->${edge.target}:${edge.targetHandle}`,
        targetResource: flowResource,
        targetId: edge.source,
      });
      entries.push({
        kind: 'flow-edge->node',
        sourceResource: flowResource,
        sourceId: `${edge.source}:${edge.sourceHandle}->${edge.target}:${edge.targetHandle}`,
        targetResource: flowResource,
        targetId: edge.target,
      });
    }
  }

  return entries;
}

// ── Search Index ──

export function buildSearchIndex(project: EngineProject): SearchEntry[] {
  const entries: SearchEntry[] = [];

  // Flow nodes: labels, types, config values
  for (const [flowId, flow] of Object.entries(project.flowsById)) {
    const resourceId = `flow://${flowId}`;
    for (const node of flow.data.nodes) {
      entries.push({ resourceId, resourceType: 'flow-node', id: node.id, field: 'type', text: node.type });
      if (node.label) {
        entries.push({ resourceId, resourceType: 'flow-node', id: node.id, field: 'label', text: node.label });
      }
      if (node.config) {
        for (const [key, value] of Object.entries(node.config)) {
          if (typeof value === 'string') {
            entries.push({ resourceId, resourceType: 'flow-node', id: node.id, field: `config.${key}`, text: value });
          }
        }
      }
    }
  }

  // Session steps: ids, promptText
  if (project.session) {
    for (const step of project.session.steps) {
      entries.push({ resourceId: 'session://default', resourceType: 'session-step', id: step.id, field: 'id', text: step.id });
      if ('promptText' in step && step.promptText) {
        entries.push({ resourceId: 'session://default', resourceType: 'session-step', id: step.id, field: 'promptText', text: step.promptText });
      }
    }
  }

  // State key names
  for (const key of Object.keys(project.initialState)) {
    entries.push({ resourceId: 'state://project', resourceType: 'state-key', id: key, field: 'name', text: key });
  }

  return entries;
}

// ── Search ──

export function searchProject(index: SearchEntry[], query: string): SearchResult {
  if (!query.trim()) {
    return { query, matches: [] };
  }

  const lowerQuery = query.toLowerCase();
  const matches = index
    .filter((entry) => entry.text.toLowerCase().includes(lowerQuery))
    .map((entry) => ({
      ...entry,
      score: entry.text.toLowerCase() === lowerQuery ? 1.0 : 0.5,
    }));

  return { query, matches };
}
