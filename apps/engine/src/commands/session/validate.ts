import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';
import { getRequiredSession, validateSession } from './_helpers';

export default defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate the current session definition',
  },
  args: {
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.validate', async () => {
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const session = getRequiredSession(runtime);
      const result = validateSession(session, runtime.listFlows().map((flow) => flow.id));
      return {
        data: result,
        exitCode: result.valid ? 0 : 1,
      };
    });
  },
});
