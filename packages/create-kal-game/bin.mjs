#!/usr/bin/env node

/**
 * create-kal-game — scaffold a new KAL-AI game project
 *
 * Usage:
 *   npx create-kal-game <project-name> [--template minimal|game]
 */

import { resolve, join } from 'node:path';
import { mkdir, writeFile, access } from 'node:fs/promises';

const args = process.argv.slice(2);

let projectName;
let template = 'minimal';

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--template' || arg === '-t') {
    const val = args[++i];
    if (val !== 'minimal' && val !== 'game') {
      console.error(`Invalid template: ${val ?? '<missing>'}. Expected "minimal" or "game".`);
      process.exit(1);
    }
    template = val;
  } else if (arg === '--help' || arg === '-h') {
    console.log(
      'Usage: create-kal-game <project-name> [--template minimal|game]\n\n' +
      'Templates:\n' +
      '  minimal  - Bare project with one example flow (default)\n' +
      '  game     - Game project with session, state, and example flows\n'
    );
    process.exit(0);
  } else if (arg.startsWith('-')) {
    console.error(`Unknown flag: ${arg}`);
    process.exit(1);
  } else if (!projectName) {
    projectName = arg;
  } else {
    console.error(`Unexpected argument: ${arg}`);
    process.exit(1);
  }
}

if (!projectName) {
  console.error('Missing project name.\nUsage: create-kal-game <project-name> [--template minimal|game]');
  process.exit(1);
}

const projectRoot = resolve(process.cwd(), projectName);

try {
  await access(projectRoot);
  console.error(`Error: Directory "${projectName}" already exists`);
  process.exit(1);
} catch {
  // doesn't exist — good
}

const created = [];

await mkdir(projectRoot, { recursive: true });
await mkdir(join(projectRoot, 'flow'), { recursive: true });

// kal_config.json
const config = {
  name: projectName,
  version: '0.1.0',
  llm: {
    provider: 'openai',
    defaultModel: 'gpt-4o-mini',
    apiKey: '${OPENAI_API_KEY}',
  },
};
await writeFile(join(projectRoot, 'kal_config.json'), JSON.stringify(config, null, 2) + '\n');
created.push('kal_config.json');

if (template === 'game') {
  // initial_state.json
  const initialState = {
    playerName: { type: 'string', value: '' },
    score: { type: 'number', value: 0 },
    turn: { type: 'number', value: 1 },
  };
  await writeFile(join(projectRoot, 'initial_state.json'), JSON.stringify(initialState, null, 2) + '\n');
  created.push('initial_state.json');

  // intro flow
  const introFlow = {
    meta: {
      schemaVersion: '1.0',
      inputs: [],
      outputs: [{ name: 'narration', type: 'string' }],
    },
    data: {
      nodes: [
        {
          id: 'prompt',
          type: 'PromptBuild',
          config: {
            defaultRole: 'system',
            fragments: [
              { id: 'intro', type: 'base', content: 'Welcome to the game! Introduce the player.' },
            ],
          },
        },
        { id: 'llm', type: 'GenerateText', config: {} },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'narration' },
        },
      ],
      edges: [
        { source: 'prompt', sourceHandle: 'messages', target: 'llm', targetHandle: 'messages' },
        { source: 'llm', sourceHandle: 'text', target: 'signal-out', targetHandle: 'data' },
      ],
    },
  };
  await writeFile(join(projectRoot, 'flow/intro.json'), JSON.stringify(introFlow, null, 2) + '\n');
  created.push('flow/intro.json');

  // session.json
  const session = {
    schemaVersion: '1.0',
    entryStep: 'intro',
    steps: [
      { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'end' },
      { id: 'end', type: 'End', message: 'Game over!' },
    ],
  };
  await writeFile(join(projectRoot, 'session.json'), JSON.stringify(session, null, 2) + '\n');
  created.push('session.json');
} else {
  // minimal: single example flow
  const exampleFlow = {
    meta: {
      schemaVersion: '1.0',
      inputs: [{ name: 'input', type: 'string' }],
      outputs: [{ name: 'output', type: 'string' }],
    },
    data: {
      nodes: [
        {
          id: 'signal-in',
          type: 'SignalIn',
          config: { channel: 'input' },
        },
        {
          id: 'signal-out',
          type: 'SignalOut',
          inputs: [{ name: 'data', type: 'string' }],
          outputs: [{ name: 'data', type: 'string' }],
          config: { channel: 'output' },
        },
      ],
      edges: [
        { source: 'signal-in', sourceHandle: 'data', target: 'signal-out', targetHandle: 'data' },
      ],
    },
  };
  await writeFile(join(projectRoot, 'flow/example.json'), JSON.stringify(exampleFlow, null, 2) + '\n');
  created.push('flow/example.json');
}

console.log(`\nCreated project "${projectName}" (${template} template):\n`);
for (const f of created) {
  console.log(`  ${projectName}/${f}`);
}
console.log(`\nNext steps:`);
console.log(`  cd ${projectName}`);
console.log(`  export OPENAI_API_KEY=sk-...`);
if (template === 'game') {
  console.log(`  npx @kal-ai/engine play .`);
} else {
  console.log(`  npx @kal-ai/engine serve .`);
}
console.log('');
