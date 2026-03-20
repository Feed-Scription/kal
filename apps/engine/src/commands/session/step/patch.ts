import { defineCommand } from 'citty';
import { EngineHttpError } from '../../../errors';
import { deepMerge, ensureRuntime, projectPathArg, runEnvelopeCommand, parseSetArgs, toStringArray } from '../../_shared';
import { findStepIndex, flowCheckArg, mutateSession, resolveFlowValidationMode, skipFlowCheckArg } from '../_helpers';

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
    'flow-check': flowCheckArg,
    'skip-flow-check': skipFlowCheckArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.step.patch', async () => {
      const stepId = typeof args.stepId === 'string' ? args.stepId : '';
      const operations = toStringArray(args.set);
      const flowValidationMode = resolveFlowValidationMode(args);
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const result = await mutateSession(runtime, (draft) => {
        const index = findStepIndex(draft, stepId);
        const patched = deepMerge(draft.steps[index]!, parseSetArgs(operations));
        if (patched.id !== stepId) {
          throw new EngineHttpError(`Patched step id must stay "${stepId}"`, 400, 'STEP_ID_MISMATCH', { expected: stepId, received: patched.id });
        }
        draft.steps[index] = patched;
        return draft;
      }, { flowValidationMode });
      return {
        data: {
          step: result.session.steps.find((step) => step.id === stepId),
          session: result.session,
        },
        warnings: result.warnings,
      };
    });
  },
});
