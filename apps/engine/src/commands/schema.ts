/**
 * Schema command - export node and session schema information
 */

import { BUILTIN_NODES } from '@kal-ai/core';
import type { EngineCliIO } from '../types';

interface SchemaCommandDependencies {
  cwd: string;
  io: EngineCliIO;
}

const VALID_SESSION_STEP_TYPES = [
  {
    type: 'RunFlow',
    fields: ['id', 'type', 'flowRef', 'next'],
    required: ['id', 'type', 'flowRef', 'next'],
  },
  {
    type: 'Prompt',
    fields: ['id', 'type', 'flowRef', 'inputChannel', 'stateKey', 'promptText', 'next'],
    required: ['id', 'type', 'next'],
    notes: 'Requires flowRef or stateKey. inputChannel required when flowRef is set.',
  },
  {
    type: 'Choice',
    fields: ['id', 'type', 'promptText', 'options', 'flowRef', 'inputChannel', 'stateKey', 'next'],
    required: ['id', 'type', 'promptText', 'options', 'next'],
    notes: 'options: Array<{ label: string, value: string }>. Requires flowRef or stateKey.',
  },
  {
    type: 'DynamicChoice',
    fields: ['id', 'type', 'promptText', 'options', 'flowRef', 'inputChannel', 'stateKey', 'next'],
    required: ['id', 'type', 'promptText', 'options', 'next'],
    notes: 'options: Array<{ label, value, when? }>. Options filtered by "when" conditions at runtime.',
  },
  {
    type: 'Branch',
    fields: ['id', 'type', 'conditions', 'default', 'defaultSetState'],
    required: ['id', 'type', 'conditions', 'default'],
    notes: 'conditions: Array<{ when: string, next: string, setState? }>',
  },
  {
    type: 'End',
    fields: ['id', 'type', 'message'],
    required: ['id', 'type'],
  },
];

export async function runSchemaCommand(
  tokens: string[],
  dependencies: SchemaCommandDependencies,
): Promise<number> {
  if (tokens.length === 0 || tokens[0] === '--help' || tokens[0] === '-h') {
    dependencies.io.stdout(
      'Usage:\n' +
      '  kal schema nodes              # List all built-in node types\n' +
      '  kal schema node <type>        # Show detailed schema for a node type\n' +
      '  kal schema session            # Show session step types and fields\n'
    );
    return tokens.length === 0 ? 2 : 0;
  }

  const subcommand = tokens[0]!;
  const format = getFormat(tokens);

  if (subcommand === 'nodes') {
    return handleNodes(dependencies.io, format);
  }
  if (subcommand === 'node') {
    const nodeType = tokens[1];
    if (!nodeType || nodeType.startsWith('--')) {
      dependencies.io.stderr('Error: Missing node type. Usage: kal schema node <type>\n');
      return 2;
    }
    return handleNode(nodeType, dependencies.io, format);
  }
  if (subcommand === 'session') {
    return handleSession(dependencies.io, format);
  }

  dependencies.io.stderr(`Error: Unknown subcommand "${subcommand}". Expected "nodes", "node", or "session".\n`);
  return 2;
}

function getFormat(tokens: string[]): 'json' | 'pretty' {
  const idx = tokens.indexOf('--format');
  if (idx !== -1) {
    const val = tokens[idx + 1];
    if (val === 'json' || val === 'pretty') return val;
  }
  return 'json';
}

function handleNodes(io: EngineCliIO, format: 'json' | 'pretty'): number {
  const nodes = BUILTIN_NODES.map((n) => ({
    type: n.type,
    label: n.label,
    category: n.category ?? '',
    inputs: n.inputs.map((i) => ({ name: i.name, type: i.type, required: i.required ?? false })),
    outputs: n.outputs.map((o) => ({ name: o.name, type: o.type })),
  }));

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
  return 0;
}

function handleNode(nodeType: string, io: EngineCliIO, format: 'json' | 'pretty'): number {
  const node = BUILTIN_NODES.find((n) => n.type === nodeType);
  if (!node) {
    io.stderr(`Error: Unknown node type "${nodeType}"\n`);
    io.stderr(`Available types: ${BUILTIN_NODES.map((n) => n.type).join(', ')}\n`);
    return 2;
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
  return 0;
}

function handleSession(io: EngineCliIO, format: 'json' | 'pretty'): number {
  if (format === 'pretty') {
    io.stdout('Session step types:\n\n');
    for (const step of VALID_SESSION_STEP_TYPES) {
      io.stdout(`  ${step.type}\n`);
      io.stdout(`    fields:   ${step.fields.join(', ')}\n`);
      io.stdout(`    required: ${step.required.join(', ')}\n`);
      if (step.notes) {
        io.stdout(`    notes:    ${step.notes}\n`);
      }
    }
  } else {
    io.stdout(JSON.stringify({ stepTypes: VALID_SESSION_STEP_TYPES }, null, 2) + '\n');
  }
  return 0;
}
