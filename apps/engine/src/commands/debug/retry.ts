import { defineCommand } from 'citty';
import { formatArg, projectPathArg } from '../_shared';
import { runLegacyDebug } from './_helpers';

export default defineCommand({
  meta: {
    name: 'retry',
    description: 'Retry a run that is currently in error state',
  },
  args: {
    projectPath: projectPathArg,
    runId: {
      type: 'string',
      description: 'Debug run id',
    },
    latest: {
      type: 'boolean',
      description: 'Use the most recent run',
      default: false,
    },
    stateDir: {
      type: 'string',
      description: 'Override the debug state directory',
    },
    format: {
      ...formatArg,
      description: 'Output format (json|pretty|agent)',
    },
  },
  async run({ args }) {
    await runLegacyDebug('--retry', {
      projectPath: typeof args.projectPath === 'string' ? args.projectPath : undefined,
      runId: typeof args.runId === 'string' ? args.runId : undefined,
      latest: args.latest === true,
      stateDir: typeof args.stateDir === 'string' ? args.stateDir : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
    });
  },
});
