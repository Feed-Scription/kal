import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';
import { mutateSession } from './_helpers';

export default defineCommand({
  meta: {
    name: 'meta-set',
    description: 'Update top-level session metadata',
  },
  args: {
    projectPath: projectPathArg,
    name: {
      type: 'string',
      description: 'Session name',
    },
    description: {
      type: 'string',
      description: 'Session description',
    },
    'entry-step': {
      type: 'string',
      description: 'Entry step id',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('session.meta-set', async () => {
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      return await mutateSession(runtime, (session) => {
        if (typeof args.name === 'string') {
          session.name = args.name;
        }
        if (typeof args.description === 'string') {
          session.description = args.description;
        }
        const entryStep = args['entry-step'];
        if (typeof entryStep === 'string') {
          session.entryStep = entryStep;
        }
        return session;
      });
    });
  },
});
