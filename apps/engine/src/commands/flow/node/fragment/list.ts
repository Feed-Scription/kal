import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../../_shared';
import { getFragments, getPromptBuildNode, summarizeFragment } from '../../_helpers';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List top-level fragments in a PromptBuild node',
  },
  args: {
    flowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    nodeId: {
      type: 'positional',
      description: 'PromptBuild node id',
      required: false,
    },
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.fragment.list', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const node = getPromptBuildNode(runtime.getFlow(flowId), nodeId);
      return {
        fragments: getFragments(node).map((fragment) => summarizeFragment(fragment)),
      };
    });
  },
});
