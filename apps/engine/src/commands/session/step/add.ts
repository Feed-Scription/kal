import { defineCommand } from 'citty';
import type { SessionStep } from '@kal-ai/core';
import { EngineHttpError } from '../../../errors';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../../_shared';
import { mutateSession } from '../_helpers';

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Append a new session step',
  },
  args: {
    projectPath: projectPathArg,
    after: {
      type: 'string',
      description: 'Insert after this step id',
    },
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
    await runEnvelopeCommand('session.step.add', async () => {
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const step = await readJsonInput({
        file: typeof args.file === 'string' ? args.file : undefined,
        json: typeof args.json === 'string' ? args.json : undefined,
        stdin: args.stdin === true,
      }) as SessionStep;
      const session = await mutateSession(runtime, (draft) => {
        if (draft.steps.some((existing) => existing.id === step.id)) {
          throw new EngineHttpError(`Step already exists: ${step.id}`, 400, 'STEP_ALREADY_EXISTS', { stepId: step.id });
        }
        const insertAfter = typeof args.after === 'string' ? draft.steps.findIndex((existing) => existing.id === args.after) : -1;
        if (typeof args.after === 'string' && insertAfter === -1) {
          throw new EngineHttpError(`Step not found: ${args.after}`, 404, 'STEP_NOT_FOUND', { stepId: args.after });
        }
        if (insertAfter === -1) {
          draft.steps.push(step);
        } else {
          draft.steps.splice(insertAfter + 1, 0, step);
        }
        return draft;
      });
      return {
        step,
        session,
      };
    });
  },
});
