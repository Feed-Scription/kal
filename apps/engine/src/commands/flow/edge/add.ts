import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../_shared';
import { getNode, mutateFlow, parseNodeHandle } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add an edge to a flow',
  },
  args: {
    flowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    projectPath: projectPathArg,
    source: {
      type: 'string',
      description: 'Source node:handle reference',
    },
    target: {
      type: 'string',
      description: 'Target node:handle reference',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.edge.add', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const sourceRef = parseNodeHandle(typeof args.source === 'string' ? args.source : '');
      const targetRef = parseNodeHandle(typeof args.target === 'string' ? args.target : '');
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const sourceNode = getNode(draft, sourceRef.nodeId);
        const targetNode = getNode(draft, targetRef.nodeId);
        if (!sourceNode.outputs.some((handle) => handle.name === sourceRef.handle)) {
          throw new Error(`Output handle not found: ${args.source}`);
        }
        if (!targetNode.inputs.some((handle) => handle.name === targetRef.handle)) {
          throw new Error(`Input handle not found: ${args.target}`);
        }
        if (draft.data.edges.some((edge) =>
          edge.source === sourceRef.nodeId &&
          edge.sourceHandle === sourceRef.handle &&
          edge.target === targetRef.nodeId &&
          edge.targetHandle === targetRef.handle
        )) {
          throw new Error('Edge already exists');
        }
        draft.data.edges.push({
          source: sourceRef.nodeId,
          sourceHandle: sourceRef.handle,
          target: targetRef.nodeId,
          targetHandle: targetRef.handle,
        });
        return draft;
      });
      return {
        flow,
      };
    });
  },
});
