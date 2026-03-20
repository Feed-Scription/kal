import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../_shared';

export default defineCommand({
  meta: {
    name: 'execute',
    description: 'Execute a flow with optional input JSON',
  },
  args: {
    flowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    projectPath: projectPathArg,
    input: {
      type: 'string',
      description: 'Inline input JSON',
    },
    file: {
      type: 'string',
      description: 'Read input JSON from a file',
    },
    stdin: {
      type: 'boolean',
      description: 'Read input JSON from stdin',
      default: false,
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.execute', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const input = (typeof args.input === 'string' || typeof args.file === 'string' || args.stdin === true)
        ? await readJsonInput({
            file: typeof args.file === 'string' ? args.file : undefined,
            json: typeof args.input === 'string' ? args.input : undefined,
            stdin: args.stdin === true,
          }) as Record<string, unknown>
        : {};
      return await runtime.executeFlow(flowId, input);
    });
  },
});
