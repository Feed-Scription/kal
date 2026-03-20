import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../_shared';
import { getRequiredSession, summarizeStep } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List session steps',
  },
  args: {
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.step.list', async () => {
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const session = getRequiredSession(runtime);
      return {
        steps: session.steps.map((step) => summarizeStep(step)),
      };
    });
  },
});
