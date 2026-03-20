import { defineCommand } from 'citty';
import { EngineHttpError } from '../../../errors';
import { createFlowNodeSelector } from '../../../flow-node-selector';
import { deepMerge, ensureRuntime, parseSetArgs, projectPathArg, runEnvelopeCommand, toStringArray } from '../../_shared';
import { findNodeIndex, getFlowClone, mutateFlow } from '../_helpers';

interface ModifiedNodeSummary {
  flowId: string;
  nodeId: string;
  nodeType: string;
}

export default defineCommand({
  meta: {
    name: 'config-set',
    description: 'Patch only the config field on a node',
  },
  args: {
    targetFlowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    targetNodeId: {
      type: 'positional',
      description: 'Node id',
      required: false,
    },
    projectPath: projectPathArg,
    'all-flows': {
      type: 'boolean',
      description: 'Apply the config patch to matching nodes in every flow',
      default: false,
    },
    flow: {
      type: 'string',
      description: 'Match flows by glob (repeatable, OR semantics)',
    },
    'node-type': {
      type: 'string',
      description: 'Match nodes by type glob (repeatable, OR semantics)',
    },
    'node-id': {
      type: 'string',
      description: 'Match node ids by glob (repeatable, OR semantics)',
    },
    where: {
      type: 'string',
      description: 'Exact-match filter like config.model=gpt-4o (repeatable, AND semantics)',
    },
    set: {
      type: 'string',
      description: 'Config assignment like path=value',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.config-set', async () => {
      const operations = toStringArray(args.set);
      const patch = parseSetArgs(operations);
      const allFlows = args['all-flows'] === true;
      const flowPatterns = toStringArray(args.flow);
      const nodeTypePatterns = toStringArray(args['node-type']);
      const nodeIdPatterns = toStringArray(args['node-id']);
      const whereClauses = toStringArray(args.where);
      const rawFlowId = typeof args.targetFlowId === 'string' ? args.targetFlowId : undefined;
      const rawNodeId = typeof args.targetNodeId === 'string' ? args.targetNodeId : undefined;
      const rawProjectPath = typeof args.projectPath === 'string' ? args.projectPath : undefined;
      const isBatchMode =
        allFlows ||
        flowPatterns.length > 0 ||
        nodeTypePatterns.length > 0 ||
        nodeIdPatterns.length > 0 ||
        whereClauses.length > 0;

      const projectPath = isBatchMode
        ? rawProjectPath ?? (rawNodeId === undefined ? rawFlowId : undefined)
        : rawProjectPath;
      const flowId = isBatchMode ? undefined : rawFlowId;
      const nodeId = isBatchMode ? undefined : rawNodeId;
      const { runtime } = await ensureRuntime(projectPath, { sessionFlowValidationMode: 'warn' });

      if (isBatchMode) {
        if (rawNodeId !== undefined || rawProjectPath !== undefined) {
          throw new EngineHttpError(
            'Batch mode does not accept positional flowId/nodeId arguments; use --flow, --node-type, --node-id, and --where selectors instead',
            400,
            'NODE_SELECTOR_INVALID',
          );
        }

        const selector = createFlowNodeSelector({
          allFlows,
          flowPatterns,
          nodeTypePatterns,
          nodeIdPatterns,
          whereClauses,
        });
        const modified: ModifiedNodeSummary[] = [];
        const updatedFlowIds: string[] = [];

        for (const flowSummary of runtime.listFlows()) {
          if (!selector.matchesFlow(flowSummary.id)) {
            continue;
          }

          const flow = getFlowClone(runtime, flowSummary.id);
          let changed = false;

          for (const node of flow.data.nodes) {
            if (!selector.matchesNode(flowSummary.id, flow, node)) {
              continue;
            }
            node.config = deepMerge(node.config ?? {}, patch);
            modified.push({ flowId: flowSummary.id, nodeId: node.id, nodeType: node.type });
            changed = true;
          }

          if (!changed) {
            continue;
          }

          await runtime.saveFlow(flowSummary.id, flow);
          updatedFlowIds.push(flowSummary.id);
        }

        if (modified.length === 0) {
          throw new EngineHttpError(
            'No nodes matched the provided selector',
            404,
            'NODE_NOT_FOUND',
            {
              allFlows,
              flowPatterns,
              nodeTypePatterns,
              nodeIdPatterns,
              whereClauses,
            },
          );
        }

        return {
          modified,
          totalFlows: updatedFlowIds.length,
          totalNodes: modified.length,
        };
      }

      if (!flowId || !nodeId) {
        throw new EngineHttpError(
          'Single-node mode requires <flowId> <nodeId>; batch mode requires --all-flows or --flow <glob>',
          400,
          'NODE_SELECTOR_INVALID',
        );
      }

      const exactFlowId = flowId ?? '';
      const exactNodeId = nodeId ?? '';
      const flow = await mutateFlow(runtime, exactFlowId, (draft) => {
        const index = findNodeIndex(draft, exactNodeId);
        const node = draft.data.nodes[index]!;
        node.config = deepMerge(node.config ?? {}, patch);
        return draft;
      });
      return {
        node: flow.data.nodes.find((node) => node.id === exactNodeId),
        flow,
        modified: [
          {
            flowId: exactFlowId,
            nodeId: exactNodeId,
            nodeType: flow.data.nodes.find((node) => node.id === exactNodeId)?.type ?? '',
          },
        ],
        totalFlows: 1,
        totalNodes: 1,
      };
    });
  },
});
