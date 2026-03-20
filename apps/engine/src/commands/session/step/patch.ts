import { defineCommand } from 'citty';
import { EngineHttpError } from '../../../errors';
import { deepMerge, ensureRuntime, projectPathArg, runEnvelopeCommand, parseSetArgs, toStringArray } from '../../_shared';
import { findStepIndex, mutateSession } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'patch',
    description: 'Patch fields on one session step',
  },
  args: {
    stepId: {
      type: 'positional',
      description: 'Step id',
      required: false,
    },
    projectPath: projectPathArg,
    set: {
      type: 'string',
      description: 'Field assignment like key.path=value',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('session.step.patch', async () => {
      const stepId = typeof args.stepId === 'string' ? args.stepId : '';
      const operations = toStringArray(args.set);
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const session = await mutateSession(runtime, (draft) => {
        const index = findStepIndex(draft, stepId);
        const patched = deepMerge(draft.steps[index]!, parseSetArgs(operations));
        if (patched.id !== stepId) {
          throw new EngineHttpError(`Patched step id must stay "${stepId}"`, 400, 'STEP_ID_MISMATCH', { expected: stepId, received: patched.id });
        }
        draft.steps[index] = patched;
        return draft;
      });
      return {
        step: session.steps.find((step) => step.id === stepId),
        session,
      };
    });
  },
});
