import { defineCommand } from 'citty';
import { deepMerge, ensureRuntime, parseSetArgs, projectPathArg, runEnvelopeCommand, toStringArray } from '../../_shared';
import { findNodeIndex, mutateFlow } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'config-set',
    description: 'Patch only the config field on a node',
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
      description: 'Config assignment like path=value',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.config-set', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
      const operations = toStringArray(args.set);
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const index = findNodeIndex(draft, nodeId);
        const node = draft.data.nodes[index]!;
        node.config = deepMerge(node.config ?? {}, parseSetArgs(operations));
        return draft;
      });
      return {
        node: flow.data.nodes.find((node) => node.id === nodeId),
        flow,
      };
    });
  },
});
