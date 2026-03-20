import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../_shared';
import { collectRemovalWarnings, findStepIndex, getRequiredSession, mutateSession } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove one session step',
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
    await runEnvelopeCommand('session.step.remove', async () => {
      const stepId = typeof args.stepId === 'string' ? args.stepId : '';
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const existing = getRequiredSession(runtime);
      const warnings = collectRemovalWarnings(existing, stepId);
      const session = await mutateSession(runtime, (draft) => {
        const index = findStepIndex(draft, stepId);
        draft.steps.splice(index, 1);
        return draft;
      });
      return {
        data: {
          removed: true,
          stepId,
          session,
        },
        warnings,
      };
    });
  },
});
