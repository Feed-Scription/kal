import type { Edge, FlowDefinition, Fragment, NodeDefinition } from '@kal-ai/core';
import type { EngineRuntime } from '../../runtime';
import { EngineHttpError } from '../../errors';
import { cloneJson } from '../session/_helpers';

export interface NodeHandleRef {
  nodeId: string;
  handle: string;
}

export function parseNodeHandle(value: string): NodeHandleRef {
  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new EngineHttpError(`Invalid node handle reference: ${value}`, 400, 'HANDLE_REF_INVALID', { value });
  }
  return {
    nodeId: value.slice(0, separatorIndex),
    handle: value.slice(separatorIndex + 1),
  };
}

export function getFlowClone(runtime: EngineRuntime, flowId: string): FlowDefinition {
  return cloneJson(runtime.getFlow(flowId));
}

export async function mutateFlow(
  runtime: EngineRuntime,
  flowId: string,
  mutator: (flow: FlowDefinition) => FlowDefinition | void,
): Promise<FlowDefinition> {
  const flow = getFlowClone(runtime, flowId);
  const result = mutator(flow) ?? flow;
  await runtime.saveFlow(flowId, result);
  return result;
}

export function findNodeIndex(flow: FlowDefinition, nodeId: string): number {
  const index = flow.data.nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) {
    throw new EngineHttpError(`Node not found: ${nodeId}`, 404, 'NODE_NOT_FOUND', { nodeId });
  }
  return index;
}

export function getNode(flow: FlowDefinition, nodeId: string): NodeDefinition {
  return flow.data.nodes[findNodeIndex(flow, nodeId)]!;
}

export function summarizeNode(node: NodeDefinition): Record<string, unknown> {
  return {
    id: node.id,
    type: node.type,
    label: node.label ?? '',
  };
}

export function hydrateNode(runtime: EngineRuntime, node: NodeDefinition): NodeDefinition {
  const manifest = runtime.getNodeManifests().find((entry) => entry.type === node.type);
  if (!manifest || node.type === 'SubFlow') {
    return node;
  }
  return {
    ...node,
    inputs: Array.isArray(node.inputs) && node.inputs.length > 0 ? node.inputs : manifest.inputs.map((input) => ({ ...input })),
    outputs: Array.isArray(node.outputs) && node.outputs.length > 0 ? node.outputs : manifest.outputs.map((output) => ({ ...output })),
  };
}

export function getPromptBuildNode(flow: FlowDefinition, nodeId: string): NodeDefinition {
  const node = getNode(flow, nodeId);
  if (node.type !== 'PromptBuild') {
    throw new EngineHttpError(`Node "${nodeId}" is type "${node.type}", expected PromptBuild`, 400, 'NODE_NOT_PROMPT_BUILD', { nodeId, nodeType: node.type });
  }
  return node;
}

export function getFragments(node: NodeDefinition): Fragment[] {
  return Array.isArray(node.config?.fragments) ? cloneJson(node.config.fragments as Fragment[]) : [];
}

export function summarizeFragment(fragment: Fragment): Record<string, unknown> {
  const previewSource =
    'content' in fragment ? fragment.content
    : 'template' in fragment && typeof fragment.template === 'string' ? fragment.template
    : 'format' in fragment && typeof fragment.format === 'string' ? fragment.format
    : undefined;
  return {
    id: 'id' in fragment ? fragment.id : undefined,
    type: fragment.type,
    content_preview: typeof previewSource === 'string' ? previewSource.slice(0, 80) : undefined,
  };
}

export function findFragmentIndex(fragments: Fragment[], fragmentId?: string, indexValue?: string): number {
  if (fragmentId) {
    const index = fragments.findIndex((fragment) => 'id' in fragment && fragment.id === fragmentId);
    if (index === -1) {
      throw new EngineHttpError(`Fragment not found: ${fragmentId}`, 404, 'FRAGMENT_NOT_FOUND', { fragmentId });
    }
    return index;
  }
  if (typeof indexValue === 'string') {
    const index = Number(indexValue);
    if (!Number.isInteger(index) || index < 0 || index >= fragments.length) {
      throw new EngineHttpError(`Fragment index out of range: ${indexValue}`, 400, 'FRAGMENT_INDEX_INVALID', { index: indexValue });
    }
    return index;
  }
  throw new EngineHttpError('Provide a fragment id or --index', 400, 'FRAGMENT_TARGET_REQUIRED');
}

export function removeConnectedEdges(edges: Edge[], nodeId: string): { kept: Edge[]; removed: Edge[] } {
  const kept: Edge[] = [];
  const removed: Edge[] = [];
  for (const edge of edges) {
    if (edge.source === nodeId || edge.target === nodeId) {
      removed.push(edge);
    } else {
      kept.push(edge);
    }
  }
  return { kept, removed };
}
