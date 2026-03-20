import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';

export default defineCommand({
  meta: {
    name: 'show',
    description: 'Show one flow definition',
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
    await runEnvelopeCommand('flow.show', async () => {
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      return runtime.getFlow(typeof args.flowId === 'string' ? args.flowId : '');
    });
  },
});
