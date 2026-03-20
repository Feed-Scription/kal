import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';

export default defineCommand({
  meta: {
    name: 'delete',
    description: 'Delete session.json',
  },
  args: {
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.delete', async () => {
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      await runtime.deleteSession();
      return {
        deleted: true,
      };
    });
  },
});
