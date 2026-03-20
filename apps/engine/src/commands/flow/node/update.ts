import { defineCommand } from 'citty';
import type { NodeDefinition } from '@kal-ai/core';
import { EngineHttpError } from '../../../errors';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../../_shared';
import { findNodeIndex, hydrateNode, mutateFlow } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Replace a node in a flow',
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
    await runEnvelopeCommand('flow.node.update', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const rawNode = await readJsonInput({
        file: typeof args.file === 'string' ? args.file : undefined,
        json: typeof args.json === 'string' ? args.json : undefined,
        stdin: args.stdin === true,
      }) as NodeDefinition;
      const node = hydrateNode(runtime, rawNode);
      if (node.id !== nodeId) {
        throw new EngineHttpError(`Replacement node id must stay "${nodeId}"`, 400, 'NODE_ID_MISMATCH', { expected: nodeId, received: node.id });
      }
      const flow = await mutateFlow(runtime, flowId, (draft) => {
        const index = findNodeIndex(draft, nodeId);
        draft.data.nodes[index] = node;
        return draft;
      });
      return {
        node,
        flow,
      };
    });
  },
});
