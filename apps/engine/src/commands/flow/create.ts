import { defineCommand } from 'citty';
import type { FlowDefinition } from '@kal-ai/core';
import { EngineHttpError } from '../../errors';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../_shared';

export default defineCommand({
  meta: {
    name: 'create',
    description: 'Create a new flow from a full definition',
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
      description: 'Read the flow definition from a file path, or use - for stdin',
    },
    json: {
      type: 'string',
      description: 'Inline flow JSON',
    },
    stdin: {
      type: 'boolean',
      description: 'Force reading the flow definition from stdin',
      default: false,
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.create', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      try {
        runtime.getFlow(flowId);
        throw new EngineHttpError(`Flow already exists: ${flowId}`, 400, 'FLOW_ALREADY_EXISTS', { flowId });
      } catch (error) {
        if (error instanceof EngineHttpError && error.code === 'FLOW_ALREADY_EXISTS') {
          throw error;
        }
        if (!(error instanceof EngineHttpError) || error.code !== 'FLOW_NOT_FOUND') {
          throw error;
        }
      }
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
