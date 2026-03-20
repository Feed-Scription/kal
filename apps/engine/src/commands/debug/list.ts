import { defineCommand } from 'citty';
import { formatArg, projectPathArg } from '../_shared';
import { runLegacyDebug } from './_helpers';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List stored debug runs',
  },
  args: {
    projectPath: projectPathArg,
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
    await runLegacyDebug('--list', {
      projectPath: typeof args.projectPath === 'string' ? args.projectPath : undefined,
      stateDir: typeof args.stateDir === 'string' ? args.stateDir : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
    });
  },
});
