import { defineCommand } from 'citty';
import { EngineHttpError } from '../../../errors';
import { deepMerge, ensureRuntime, parseSetArgs, projectPathArg, runEnvelopeCommand, toStringArray } from '../../_shared';
import { findNodeIndex, mutateFlow } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'patch',
    description: 'Patch a node definition with --set',
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
    set: {
      type: 'string',
      description: 'Field assignment like key.path=value',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.patch', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
      const operations = toStringArray(args.set);
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const index = findNodeIndex(draft, nodeId);
        const patched = deepMerge(draft.data.nodes[index]!, parseSetArgs(operations));
        if (patched.id !== nodeId) {
          throw new EngineHttpError(`Patched node id must stay "${nodeId}"`, 400, 'NODE_ID_MISMATCH', { expected: nodeId, received: patched.id });
        }
        draft.data.nodes[index] = patched;
        return draft;
      });
      return {
        node: flow.data.nodes.find((node) => node.id === nodeId),
        flow,
      };
    });
  },
});
