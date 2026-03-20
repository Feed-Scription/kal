import { defineCommand } from 'citty';
import { formatArg, projectPathArg } from '../_shared';
import { runLegacyDebug } from './_helpers';

export default defineCommand({
  meta: {
    name: 'diff',
    description: 'Compare two stored debug snapshots',
  },
  args: {
    projectPath: projectPathArg,
    runId: {
      type: 'string',
      description: 'Base debug run id',
    },
    diffRunId: {
      type: 'string',
      description: 'Run id to compare against',
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
    await runLegacyDebug('--diff', {
      projectPath: typeof args.projectPath === 'string' ? args.projectPath : undefined,
      runId: typeof args.runId === 'string' ? args.runId : undefined,
      diffRunId: typeof args.diffRunId === 'string' ? args.diffRunId : undefined,
      stateDir: typeof args.stateDir === 'string' ? args.stateDir : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
    });
  },
});
