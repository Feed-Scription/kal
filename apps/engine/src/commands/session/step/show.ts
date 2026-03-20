import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../_shared';
import { getRequiredSession, getStep } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'show',
    description: 'Show one session step',
  },
  args: {
    stepId: {
      type: 'positional',
      description: 'Step id',
      required: false,
    },
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.step.show', async () => {
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const session = getRequiredSession(runtime);
      return getStep(session, typeof args.stepId === 'string' ? args.stepId : '');
    });
  },
});
