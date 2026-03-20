import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../../_shared';
import { collectRemovalWarnings, findStepIndex, flowCheckArg, getRequiredSession, mutateSession, resolveFlowValidationMode, skipFlowCheckArg } from '../_helpers';

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
    'flow-check': flowCheckArg,
    'skip-flow-check': skipFlowCheckArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.step.remove', async () => {
      const stepId = typeof args.stepId === 'string' ? args.stepId : '';
      const flowValidationMode = resolveFlowValidationMode(args);
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const existing = getRequiredSession(runtime);
      const warnings = collectRemovalWarnings(existing, stepId);
      const result = await mutateSession(runtime, (draft) => {
        const index = findStepIndex(draft, stepId);
        draft.steps.splice(index, 1);
        return draft;
      }, { flowValidationMode });
      return {
        data: {
          removed: true,
          stepId,
          session: result.session,
        },
        warnings: [...warnings, ...result.warnings],
      };
    });
  },
});
