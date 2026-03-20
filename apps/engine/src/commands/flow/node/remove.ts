import { defineCommand } from 'citty';
import type { Edge } from '@kal-ai/core';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../_shared';
import { findNodeIndex, mutateFlow, removeConnectedEdges } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove a node and any connected edges',
  },
  args: {
    flowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    nodeId: {
      type: 'positional',
      description: 'Node id',
      required: false,
    },
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.remove', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      let removedEdges: Edge[] = [];
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const index = findNodeIndex(draft, nodeId);
        draft.data.nodes.splice(index, 1);
        const split = removeConnectedEdges(draft.data.edges, nodeId);
        draft.data.edges = split.kept;
        removedEdges = split.removed;
        return draft;
      });
      return {
        removed: true,
        nodeId,
        removed_edges: removedEdges,
        flow,
      };
    });
  },
});
