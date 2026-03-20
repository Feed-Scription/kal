import { defineCommand } from 'citty';
import { getCliContext, setExitCode } from '../../cli-context';
import { formatArg } from '../_shared';
import { resolveFlowInfo } from './_helpers';

export default defineCommand({
  meta: {
    name: 'nodes',
    description: 'List nodes in a flow',
  },
  args: {
    flow: {
      type: 'positional',
      description: 'Flow path or id',
      required: false,
    },
    project: {
      type: 'string',
      description: 'Project root when using a flow id',
    },
    format: formatArg,
  },
  async run({ args }) {
    const { cwd, io, createRuntime } = getCliContext();
    const format = args.format === 'pretty' ? 'pretty' : 'json';

    if (typeof args.flow !== 'string' || !args.flow) {
      io.stderr('Error: Missing flow path. Usage: kal eval nodes <flow>\n');
      setExitCode(2);
      return;
    }

    try {
      const { projectRoot, flowId } = resolveFlowInfo(
        args.flow,
        typeof args.project === 'string' ? args.project : undefined,
        cwd,
      );
      const runtime = await createRuntime(projectRoot);
      const flow = runtime.getFlow(flowId);

      const nodes = flow.data.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label ?? '',
        inputs: n.inputs.map((i) => ({ name: i.name, type: i.type })),
        outputs: n.outputs.map((o) => ({ name: o.name, type: o.type })),
      }));

      if (format === 'pretty') {
        io.stdout(`Flow: ${flowId}\n`);
        io.stdout(`Nodes: ${nodes.length}\n\n`);
        for (const n of nodes) {
          const label = n.label ? ` (${n.label})` : '';
          io.stdout(`  ${n.id}  [${n.type}]${label}\n`);
          if (n.inputs.length > 0) {
            io.stdout(`    inputs:  ${n.inputs.map((i) => `${i.name}:${i.type}`).join(', ')}\n`);
          }
          if (n.outputs.length > 0) {
            io.stdout(`    outputs: ${n.outputs.map((o) => `${o.name}:${o.type}`).join(', ')}\n`);
          }
        }
      } else {
        io.stdout(JSON.stringify({ flowId, nodes }, null, 2) + '\n');
      }
      setExitCode(0);
    } catch (error) {
      io.stderr(`Error: ${(error as Error).message}\n`);
      setExitCode(1);
    }
  },
});
