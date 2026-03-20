import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';
import { collectLintPayload } from '../lint.js';

export default defineCommand({
  meta: {
    name: 'validate',
    description: 'Run flow-level validation diagnostics',
  },
  args: {
    flowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    projectPath: projectPathArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.validate', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const { runtime, projectRoot } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      runtime.getFlow(flowId);
      const payload = await collectLintPayload(projectRoot);
      const diagnostics = payload.diagnostics.filter((diagnostic) => diagnostic.flowId === flowId || diagnostic.file === `flow/${flowId}.json`);
      const errors = diagnostics.filter((diagnostic) => diagnostic.severity !== 'warning');
      return {
        data: {
          valid: errors.length === 0,
          diagnostics,
        },
        exitCode: errors.length === 0 ? 0 : 1,
      };
    });
  },
});
