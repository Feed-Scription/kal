import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';
import { flowCheckArg, getRequiredSession, resolveFlowValidationMode, skipFlowCheckArg, validateSession } from './_helpers';

export default defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate the current session definition',
  },
  args: {
    projectPath: projectPathArg,
    'flow-check': flowCheckArg,
    'skip-flow-check': skipFlowCheckArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.validate', async () => {
      const flowValidationMode = resolveFlowValidationMode(args);
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const session = getRequiredSession(runtime);
      const result = validateSession(session, runtime.listFlows().map((flow) => flow.id), {
        flowValidationMode,
      });
      return {
        data: result,
        warnings: result.warnings.map((warning) =>
          warning.path ? `${warning.path}: ${warning.message}` : warning.message
        ),
        exitCode: result.valid ? 0 : 1,
      };
    });
  },
});
