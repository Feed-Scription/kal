import { defineCommand } from 'citty';
import { BUILTIN_NODES } from '@kal-ai/core';
import { getCliContext, setExitCode } from '../../cli-context';
import { formatArg } from '../_shared';

export function collectSchemaNodesPayload() {
  return {
    nodes: BUILTIN_NODES.map((n) => ({
      type: n.type,
      label: n.label,
      category: n.category ?? '',
      inputs: n.inputs.map((i) => ({ name: i.name, type: i.type, required: i.required ?? false })),
      outputs: n.outputs.map((o) => ({ name: o.name, type: o.type })),
      configSchema: n.configSchema ?? null,
      defaultConfig: n.defaultConfig ?? null,
    })),
  };
}

export default defineCommand({
  meta: {
    name: 'nodes',
    description: 'List built-in node schemas',
  },
  args: {
    format: formatArg,
  },
  async run({ args }) {
    const { io } = getCliContext();
    const { nodes } = collectSchemaNodesPayload();
    const format = args.format === 'pretty' ? 'pretty' : 'json';

    if (format === 'pretty') {
      io.stdout(`Built-in nodes (${nodes.length}):\n\n`);
      for (const n of nodes) {
        io.stdout(`  ${n.type}  [${n.category}]  ${n.label}\n`);
        if (n.inputs.length > 0) {
          io.stdout(`    inputs:  ${n.inputs.map((i) => `${i.name}:${i.type}${i.required ? '*' : ''}`).join(', ')}\n`);
        }
        if (n.outputs.length > 0) {
          io.stdout(`    outputs: ${n.outputs.map((o) => `${o.name}:${o.type}`).join(', ')}\n`);
        }
      }
    } else {
      io.stdout(JSON.stringify({ nodes }, null, 2) + '\n');
    }
    setExitCode(0);
  },
});
