import { defineCommand } from 'citty';
import { BUILTIN_NODES } from '@kal-ai/core';
import { getCliContext, setExitCode } from '../../cli-context';
import { formatArg } from '../_shared';

export default defineCommand({
  meta: {
    name: 'node',
    description: 'Show one built-in node schema',
  },
  args: {
    nodeType: {
      type: 'positional',
      description: 'Node type',
      required: false,
    },
    format: formatArg,
  },
  async run({ args }) {
    const { io } = getCliContext();
    const format = args.format === 'pretty' ? 'pretty' : 'json';

    if (typeof args.nodeType !== 'string' || !args.nodeType) {
      io.stderr('Error: Missing node type. Usage: kal schema node <type>\n');
      setExitCode(2);
      return;
    }

    const node = BUILTIN_NODES.find((n) => n.type === args.nodeType);
    if (!node) {
      io.stderr(`Error: Unknown node type "${args.nodeType}"\n`);
      io.stderr(`Available types: ${BUILTIN_NODES.map((n) => n.type).join(', ')}\n`);
      setExitCode(2);
      return;
    }

    const detail = {
      type: node.type,
      label: node.label,
      category: node.category ?? '',
      inputs: node.inputs.map((i) => ({
        name: i.name,
        type: i.type,
        required: i.required ?? false,
        defaultValue: i.defaultValue,
      })),
      outputs: node.outputs.map((o) => ({ name: o.name, type: o.type })),
      configSchema: node.configSchema ?? null,
      defaultConfig: node.defaultConfig ?? null,
    };

    if (format === 'pretty') {
      io.stdout(`${detail.type}  [${detail.category}]  ${detail.label}\n\n`);
      io.stdout('Inputs:\n');
      for (const i of detail.inputs) {
        const req = i.required ? ' (required)' : '';
        const def = i.defaultValue !== undefined ? ` default=${JSON.stringify(i.defaultValue)}` : '';
        io.stdout(`  ${i.name}: ${i.type}${req}${def}\n`);
      }
      io.stdout('\nOutputs:\n');
      for (const o of detail.outputs) {
        io.stdout(`  ${o.name}: ${o.type}\n`);
      }
      if (detail.configSchema) {
        io.stdout(`\nConfig Schema:\n${JSON.stringify(detail.configSchema, null, 2)}\n`);
      }
      if (detail.defaultConfig) {
        io.stdout(`\nDefault Config:\n${JSON.stringify(detail.defaultConfig, null, 2)}\n`);
      }
    } else {
      io.stdout(JSON.stringify(detail, null, 2) + '\n');
    }
    setExitCode(0);
  },
});
