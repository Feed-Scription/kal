import { defineCommand } from 'citty';
import type { SessionStep } from '@kal-ai/core';
import { EngineHttpError } from '../../../errors';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../../_shared';
import { findStepIndex, flowCheckArg, mutateSession, resolveFlowValidationMode, skipFlowCheckArg } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Replace one session step',
  },
  args: {
    stepId: {
      type: 'positional',
      description: 'Step id',
      required: false,
    },
    projectPath: projectPathArg,
    file: {
      type: 'string',
      description: 'Read step JSON from a file path, or use - for stdin',
    },
    json: {
      type: 'string',
      description: 'Inline step JSON',
    },
    stdin: {
      type: 'boolean',
      description: 'Force reading step JSON from stdin',
      default: false,
    },
    'flow-check': flowCheckArg,
    'skip-flow-check': skipFlowCheckArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.step.update', async () => {
      const stepId = typeof args.stepId === 'string' ? args.stepId : '';
      const flowValidationMode = resolveFlowValidationMode(args);
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const step = await readJsonInput({
        file: typeof args.file === 'string' ? args.file : undefined,
        json: typeof args.json === 'string' ? args.json : undefined,
        stdin: args.stdin === true,
      }) as SessionStep;
      if (step.id !== stepId) {
        throw new EngineHttpError(`Replacement step id must stay "${stepId}"`, 400, 'STEP_ID_MISMATCH', { expected: stepId, received: step.id });
      }
      const result = await mutateSession(runtime, (draft) => {
        const index = findStepIndex(draft, stepId);
        draft.steps[index] = step;
        return draft;
      }, { flowValidationMode });
      return {
        data: {
          step,
          session: result.session,
        },
        warnings: result.warnings,
      };
    });
  },
});
