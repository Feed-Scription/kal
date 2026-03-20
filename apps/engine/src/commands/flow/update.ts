import { defineCommand } from 'citty';
import type { FlowDefinition } from '@kal-ai/core';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../_shared';

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Replace an existing flow with a full definition',
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
      description: 'Read the flow definition from a file',
    },
    json: {
      type: 'string',
      description: 'Inline flow JSON',
    },
    stdin: {
      type: 'boolean',
      description: 'Read the flow definition from stdin',
      default: false,
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.update', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      runtime.getFlow(flowId);
      const flow = await readJsonInput({
        file: typeof args.file === 'string' ? args.file : undefined,
        json: typeof args.json === 'string' ? args.json : undefined,
        stdin: args.stdin === true,
      }) as FlowDefinition;
      await runtime.saveFlow(flowId, flow);
      return flow;
    });
  },
});
