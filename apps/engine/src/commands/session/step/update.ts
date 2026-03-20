import { defineCommand } from 'citty';
import type { SessionStep } from '@kal-ai/core';
import { EngineHttpError } from '../../../errors';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../../_shared';
import { findStepIndex, mutateSession } from '../_helpers';

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
      description: 'Read step JSON from a file',
    },
    json: {
      type: 'string',
      description: 'Inline step JSON',
    },
    stdin: {
      type: 'boolean',
      description: 'Read step JSON from stdin',
      default: false,
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('session.step.update', async () => {
      const stepId = typeof args.stepId === 'string' ? args.stepId : '';
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const step = await readJsonInput({
        file: typeof args.file === 'string' ? args.file : undefined,
        json: typeof args.json === 'string' ? args.json : undefined,
        stdin: args.stdin === true,
      }) as SessionStep;
      if (step.id !== stepId) {
        throw new EngineHttpError(`Replacement step id must stay "${stepId}"`, 400, 'STEP_ID_MISMATCH', { expected: stepId, received: step.id });
      }
      const session = await mutateSession(runtime, (draft) => {
        const index = findStepIndex(draft, stepId);
        draft.steps[index] = step;
        return draft;
      });
      return {
        step,
        session,
      };
    });
  },
});
