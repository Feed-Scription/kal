import { defineCommand } from 'citty';
import type { NodeDefinition } from '@kal-ai/core';
import { EngineHttpError } from '../../../errors';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../../_shared';
import { hydrateNode, mutateFlow } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a node to a flow',
  },
  args: {
    flowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    projectPath: projectPathArg,
    file: {
      type: 'string',
      description: 'Read node JSON from a file',
    },
    json: {
      type: 'string',
      description: 'Inline node JSON',
    },
    stdin: {
      type: 'boolean',
      description: 'Read node JSON from stdin',
      default: false,
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.node.add', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const rawNode = await readJsonInput({
        file: typeof args.file === 'string' ? args.file : undefined,
        json: typeof args.json === 'string' ? args.json : undefined,
        stdin: args.stdin === true,
      }) as NodeDefinition;
      const node = hydrateNode(runtime, rawNode);
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        if (draft.data.nodes.some((existing) => existing.id === node.id)) {
          throw new EngineHttpError(`Node already exists: ${node.id}`, 400, 'NODE_ALREADY_EXISTS', { nodeId: node.id });
        }
        draft.data.nodes.push(node);
        return draft;
      });
      return {
        node,
        flow,
      };
    });
  },
});
