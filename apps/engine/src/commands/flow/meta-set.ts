import { defineCommand } from 'citty';
import { ensureRuntime, projectPathArg, runEnvelopeCommand } from '../_shared';
import { mutateFlow } from './_helpers';

export default defineCommand({
  meta: {
    name: 'meta-set',
    description: 'Update top-level flow metadata',
  },
  args: {
    flowId: {
      type: 'positional',
      description: 'Flow id',
      required: false,
    },
    projectPath: projectPathArg,
    name: {
      type: 'string',
      description: 'Flow name',
    },
    description: {
      type: 'string',
      description: 'Flow description',
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('flow.meta-set', async () => {
      const flowId = typeof args.flowId === 'string' ? args.flowId : '';
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      return await mutateFlow(runtime, flowId, (flow) => {
        if (typeof args.name === 'string') {
          flow.meta.name = args.name;
        }
        if (typeof args.description === 'string') {
          flow.meta.description = args.description;
        }
        return flow;
      });
    });
  },
});
