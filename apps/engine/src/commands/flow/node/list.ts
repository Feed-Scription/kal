import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../_shared';
import { summarizeNode } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List nodes in a flow',
  },
  args: {
    flowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.list', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const flow = runtime.getFlow(flowId);
      return {
        nodes: flow.data.nodes.map((node) => summarizeNode(node)),
      };
    });
  },
});
