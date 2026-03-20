import { defineCommand } from 'citty';
import type { Fragment } from '@kal-ai/core';
import { ensureRuntime, projectPathArg, readJsonInput, readStdin, runEnvelopeCommand } from '../../../_shared';
import { findFragmentIndex, findNodeIndex, getFragments, getPromptBuildNode, mutateFlow } from '../../_helpers';

function patchFragmentFromStdin(existing: Fragment, args: Record<string, string | boolean | string[] | undefined>, stdinContent: string): Fragment {
  const next = structuredClone(existing);
  if ('content' in next) {
    next.content = stdinContent;
  } else if ('template' in next) {
    next.template = stdinContent;
  }
  if (typeof args.id === 'string' && 'id' in next) {
    next.id = args.id;
  }
  if (typeof args.source === 'string' && 'source' in next) {
    next.source = args.source;
  }
  if (typeof args.template === 'string' && args.template !== '-' && 'template' in next) {
    next.template = args.template;
  }
  return next;
}

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Replace one top-level fragment',
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
    file: {
      type: 'string',
      description: 'Read fragment JSON from a file',
    },
    json: {
      type: 'string',
      description: 'Inline fragment JSON',
    },
    stdin: {
      type: 'boolean',
      description: 'Read fragment content from stdin',
      default: false,
    },
    id: {
      type: 'string',
      description: 'Override fragment id when using --stdin',
    },
    source: {
      type: 'string',
      description: 'Override field source when using --stdin',
    },
    template: {
      type: 'string',
      description: 'Override field template when using --stdin (use - to read from stdin)',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.fragment.update', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
      const fragmentId = typeof args.fragmentId === 'string' ? args.fragmentId : undefined;
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const currentFlow = runtime.getFlow(flowId);
      const currentNode = getPromptBuildNode(currentFlow, nodeId);
      const currentFragments = getFragments(currentNode);
      const fragmentIndex = findFragmentIndex(currentFragments, fragmentId, typeof args.index === 'string' ? args.index : undefined);
      const existing = currentFragments[fragmentIndex]!;
      const nextFragment = args.stdin === true || (!process.stdin.isTTY && !args.file && !args.json)
        ? patchFragmentFromStdin(existing, args, await readStdin())
        : await readJsonInput({
            file: typeof args.file === 'string' ? args.file : undefined,
            json: typeof args.json === 'string' ? args.json : undefined,
          }) as Fragment;
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const nodeIndex = findNodeIndex(draft, nodeId);
        const node = getPromptBuildNode(draft, nodeId);
        const fragments = getFragments(node);
        fragments[fragmentIndex] = nextFragment;
        draft.data.nodes[nodeIndex]!.config = {
          ...(draft.data.nodes[nodeIndex]!.config ?? {}),
          fragments,
        };
        return draft;
      });
      return {
        fragment: nextFragment,
        flow,
      };
    });
  },
});
