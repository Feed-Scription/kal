import { defineCommand } from 'citty';
import { projectPathArg } from '../_shared';
import { runLegacyDebug } from './_helpers';

export default defineCommand({
  meta: {
    name: 'delete',
    description: 'Delete a stored debug run',
  },
  args: {
    projectPath: projectPathArg,
    runId: {
      type: 'string',
      description: 'Debug run id',
    },
    stateDir: {
      type: 'string',
      description: 'Override the debug state directory',
    },
  },
  async run({ args }) {
    await runLegacyDebug('--delete', {
      projectPath: typeof args.projectPath === 'string' ? args.projectPath : undefined,
      runId: typeof args.runId === 'string' ? args.runId : undefined,
      stateDir: typeof args.stateDir === 'string' ? args.stateDir : undefined,
    });
  },
});
