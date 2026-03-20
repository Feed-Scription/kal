import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../_shared';
import { mutateFlow, parseNodeHandle } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove an edge from a flow',
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
    await runEnvelopeCommand('flow.edge.remove', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const sourceRef = parseNodeHandle(typeof args.source === 'string' ? args.source : '');
      const targetRef = parseNodeHandle(typeof args.target === 'string' ? args.target : '');
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const index = draft.data.edges.findIndex((edge) =>
          edge.source === sourceRef.nodeId &&
          edge.sourceHandle === sourceRef.handle &&
          edge.target === targetRef.nodeId &&
          edge.targetHandle === targetRef.handle
        );
        if (index === -1) {
          throw new Error('Edge not found');
        }
        draft.data.edges.splice(index, 1);
        return draft;
      });
      return {
        flow,
      };
    });
  },
});
