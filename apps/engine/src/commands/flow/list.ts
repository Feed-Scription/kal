import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List flows in the current project',
  },
  args: {
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.list', async () => {
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      return {
        flows: runtime.listFlows(),
      };
    });
  },
});
