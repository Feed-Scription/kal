import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';

export default defineCommand({
  meta: {
    name: 'show',
    description: 'Show the current session definition',
  },
  args: {
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.show', async () => {
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      return runtime.getSession() ?? null;
    });
  },
});
