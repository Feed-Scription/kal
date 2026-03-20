import { defineCommand } from 'citty';
import { formatArg, projectPathArg } from '../_shared';
import { runLegacyDebug } from './_helpers';

export default defineCommand({
  meta: {
    name: 'step',
    description: 'Advance exactly one step in the current run',
  },
  args: {
    projectPath: projectPathArg,
    input: {
      type: 'string',
      description: 'Input to feed the waiting step',
    },
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
    await runLegacyDebug('--step', {
      projectPath: typeof args.projectPath === 'string' ? args.projectPath : undefined,
      input: typeof args.input === 'string' ? args.input : undefined,
      runId: typeof args.runId === 'string' ? args.runId : undefined,
      latest: args.latest === true,
      stateDir: typeof args.stateDir === 'string' ? args.stateDir : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
    });
  },
});
