import { defineCommand } from 'citty';
import { formatArg, projectPathArg } from '../_shared';
import { runLegacyDebug } from './_helpers';

export default defineCommand({
  meta: {
    name: 'start',
    description: 'Start a new debug run',
  },
  args: {
    projectPath: projectPathArg,
    forceNew: {
      type: 'boolean',
      description: 'Create a new run even if an active one exists',
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
    await runLegacyDebug('--start', {
      projectPath: typeof args.projectPath === 'string' ? args.projectPath : undefined,
      forceNew: args.forceNew === true,
      stateDir: typeof args.stateDir === 'string' ? args.stateDir : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
    });
  },
});
