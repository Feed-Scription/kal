import { defineCommand } from 'citty';
import type { Fragment } from '@kal-ai/core';
import { EngineHttpError } from '../../../../errors';
import { ensureRuntime, projectPathArg, readJsonInput, readStdin, runEnvelopeCommand } from '../../../_shared';
import { findNodeIndex, getFragments, getPromptBuildNode, mutateFlow } from '../../_helpers';

function buildFragmentFromFlags(args: Record<string, string | boolean | string[] | undefined>, stdinContent: string): Fragment {
  const type = typeof args.type === 'string' ? args.type : undefined;
  const id = typeof args.id === 'string' ? args.id : undefined;
  if (!type || !id) {
    throw new EngineHttpError('--stdin fragment input requires --type and --id', 400, 'FRAGMENT_STDIN_ARGS_REQUIRED');
  }
  if (type === 'base') {
    return {
      type: 'base',
      id,
      content: stdinContent,
    };
  }
  if (type === 'field') {
    const source = typeof args.source === 'string' ? args.source : undefined;
    if (!source) {
      throw new EngineHttpError('Field fragments require --source', 400, 'FRAGMENT_SOURCE_REQUIRED');
    }
    return {
      type: 'field',
      id,
      source,
      template: typeof args.template === 'string' && args.template !== '-' ? args.template : stdinContent,
    };
  }
  throw new EngineHttpError(`--stdin is only supported for base or field fragments, got ${type}`, 400, 'FRAGMENT_STDIN_UNSUPPORTED', { type });
}

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a top-level fragment to a PromptBuild node',
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
    after: {
      type: 'string',
      description: 'Insert after this fragment id',
    },
    file: {
      type: 'string',
      description: 'Read fragment JSON from a file path, or use - for stdin',
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
    type: {
      type: 'string',
      description: 'Fragment type when using --stdin',
    },
    id: {
      type: 'string',
      description: 'Fragment id when using --stdin',
    },
    source: {
      type: 'string',
      description: 'Field fragment source when using --stdin',
    },
    template: {
      type: 'string',
      description: 'Field fragment template when using --stdin (use - to read from stdin)',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.fragment.add', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const fragment = args.stdin === true || (!process.stdin.isTTY && !args.file && !args.json)
        ? buildFragmentFromFlags(args, await readStdin())
        : await readJsonInput({
            file: typeof args.file === 'string' ? args.file : undefined,
            json: typeof args.json === 'string' ? args.json : undefined,
          }) as Fragment;
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const nodeIndex = findNodeIndex(draft, nodeId);
        const node = getPromptBuildNode(draft, nodeId);
        const fragments = getFragments(node);
        if ('id' in fragment && fragment.id && fragments.some((existing) => 'id' in existing && existing.id === fragment.id)) {
          throw new EngineHttpError(`Fragment already exists: ${fragment.id}`, 400, 'FRAGMENT_ALREADY_EXISTS', { fragmentId: fragment.id });
        }
        const afterIndex = typeof args.after === 'string'
          ? fragments.findIndex((existing) => 'id' in existing && existing.id === args.after)
          : -1;
        if (typeof args.after === 'string' && afterIndex === -1) {
          throw new EngineHttpError(`Fragment not found: ${args.after}`, 404, 'FRAGMENT_NOT_FOUND', { fragmentId: args.after });
        }
        if (afterIndex === -1) {
          fragments.push(fragment);
        } else {
          fragments.splice(afterIndex + 1, 0, fragment);
        }
        draft.data.nodes[nodeIndex]!.config = {
          ...(draft.data.nodes[nodeIndex]!.config ?? {}),
          fragments,
        };
        return draft;
      });
      return {
        fragment,
        flow,
      };
    });
  },
});
