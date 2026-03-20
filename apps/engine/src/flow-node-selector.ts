import { isDeepStrictEqual } from 'node:util';
import type { FlowDefinition, NodeDefinition } from '@kal-ai/core';
import picomatch from 'picomatch';
import { EngineHttpError } from './errors';
import { parseSetValue } from './commands/_shared';

export interface FlowNodeWhereFilter {
  path: string;
  value: unknown;
}

export interface FlowNodeSelectorInput {
  allFlows: boolean;
  flowPatterns: string[];
  nodeTypePatterns: string[];
  nodeIdPatterns: string[];
  whereClauses: string[];
}

export interface FlowNodeSelector {
  matchesFlow(flowId: string): boolean;
  matchesNode(flowId: string, flow: FlowDefinition, node: NodeDefinition): boolean;
}

function getPathValue(value: unknown, path: string): unknown {
  const segments = path.split('.').filter(Boolean);
  let cursor = value;
  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }
    if (cursor == null || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function parseWhereClause(entry: string): FlowNodeWhereFilter {
  const separatorIndex = entry.indexOf('=');
  if (separatorIndex <= 0) {
    throw new EngineHttpError(`Invalid --where entry: ${entry}`, 400, 'NODE_SELECTOR_INVALID', {
      entry,
    });
  }

  const path = entry.slice(0, separatorIndex).trim();
  if (!path) {
    throw new EngineHttpError(`Invalid --where path: ${entry}`, 400, 'NODE_SELECTOR_INVALID', {
      entry,
    });
  }

  return {
    path,
    value: parseSetValue(entry.slice(separatorIndex + 1)),
  };
}

function buildMatcher(patterns: string[]): ((value: string) => boolean) | null {
  if (patterns.length === 0) {
    return null;
  }

  const matchers = patterns.map((pattern) => picomatch(pattern));
  return (value: string) => matchers.some((matcher) => matcher(value));
}

function buildWhereCandidate(flowId: string, flow: FlowDefinition, node: NodeDefinition): Record<string, unknown> {
  return {
    ...node,
    flowId,
    meta: flow.meta,
  };
}

export function createFlowNodeSelector(input: FlowNodeSelectorInput): FlowNodeSelector {
  if (input.allFlows && input.flowPatterns.length > 0) {
    throw new EngineHttpError(
      '--all-flows and --flow cannot be used together',
      400,
      'NODE_SELECTOR_INVALID',
    );
  }

  if (!input.allFlows && input.flowPatterns.length === 0) {
    throw new EngineHttpError(
      'Batch mode requires an explicit scope: use --all-flows or at least one --flow <glob>',
      400,
      'NODE_SELECTOR_SCOPE_REQUIRED',
    );
  }

  const matchFlow = buildMatcher(input.flowPatterns);
  const matchNodeType = buildMatcher(input.nodeTypePatterns);
  const matchNodeId = buildMatcher(input.nodeIdPatterns);
  const whereFilters = input.whereClauses.map(parseWhereClause);

  const matchesFlow = (flowId: string): boolean =>
    input.allFlows || matchFlow?.(flowId) === true;

  return {
    matchesFlow,
    matchesNode(flowId: string, flow: FlowDefinition, node: NodeDefinition): boolean {
      if (!matchesFlow(flowId)) {
        return false;
      }
      if (matchNodeType && !matchNodeType(node.type)) {
        return false;
      }
      if (matchNodeId && !matchNodeId(node.id)) {
        return false;
      }

      if (whereFilters.length === 0) {
        return true;
      }

      const candidate = buildWhereCandidate(flowId, flow, node);
      return whereFilters.every((filter) => isDeepStrictEqual(getPathValue(candidate, filter.path), filter.value));
    },
  };
}
