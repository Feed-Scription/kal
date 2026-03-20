import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../../_shared';
import { findFragmentIndex, findNodeIndex, getFragments, getPromptBuildNode, mutateFlow } from '../../_helpers';

export default defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove one top-level fragment',
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
    fragmentId: {
      type: 'positional',
      description: 'Fragment id',
      required: false,
    },
    projectPath: projectPathArg,
    index: {
      type: 'string',
      description: 'Fallback fragment index when there is no id',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.fragment.remove', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
      const fragmentId = typeof args.fragmentId === 'string' ? args.fragmentId : undefined;
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      let removed: unknown;
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const nodeIndex = findNodeIndex(draft, nodeId);
        const node = getPromptBuildNode(draft, nodeId);
        const fragments = getFragments(node);
        const fragmentIndex = findFragmentIndex(fragments, fragmentId, typeof args.index === 'string' ? args.index : undefined);
        removed = fragments.splice(fragmentIndex, 1)[0];
        draft.data.nodes[nodeIndex]!.config = {
          ...(draft.data.nodes[nodeIndex]!.config ?? {}),
          fragments,
        };
        return draft;
      });
      return {
        removed,
        flow,
      };
    });
  },
});
