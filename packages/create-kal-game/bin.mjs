#!/usr/bin/env node

/**
 * create-kal-game — scaffold a new KAL-AI game project
 *
 * Usage:
 *   npx create-kal-game <project-name> [--template minimal|game]
 *
 * NOTE: Template definitions here mirror apps/engine/src/scaffold-templates.ts.
 * When updating templates, keep both in sync.
 */

import { resolve, join, dirname } from 'node:path';
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

// ── Template definitions (synced with apps/engine/src/scaffold-templates.ts) ──

function buildConfig(name) {
  return {
    name,
    version: '0.1.0',
    engine: {
      logLevel: 'info',
      maxConcurrentFlows: 5,
      nodeTimeout: 30000,
      runTimeout: 0,
    },
    llm: {
      provider: 'openai',
      defaultModel: 'gpt-4o-mini',
      apiKey: '${OPENAI_API_KEY}',
      retry: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitter: true,
      },
      cache: {
        enabled: true,
      },
    },
  };
}

function getTemplateFiles(tmpl, name) {
  const files = [
    { path: 'kal_config.json', content: buildConfig(name) },
  ];

  if (tmpl === 'game') {
    files.push(
      {
        path: 'initial_state.json',
        content: {
          playerName: { type: 'string', value: '' },
          score: { type: 'number', value: 0 },
          turn: { type: 'number', value: 1 },
        },
      },
      {
        path: 'flow/intro.json',
        content: {
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
        },
      },
      {
        path: 'session.json',
        content: {
          schemaVersion: '1.0',
          entryStep: 'intro',
          steps: [
            { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'end' },
            { id: 'end', type: 'End', message: 'Game over!' },
          ],
        },
      },
    );
  } else {
    files.push(
      { path: 'initial_state.json', content: {} },
      {
        path: 'flow/example.json',
        content: {
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
                inputs: [],
                outputs: [{ name: 'data', type: 'string' }],
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
              {
                source: 'signal-in',
                sourceHandle: 'data',
                target: 'signal-out',
                targetHandle: 'data',
              },
            ],
          },
        },
      },
    );
  }

  return files;
}

// ── Scaffold ──

const files = getTemplateFiles(template, projectName);

for (const file of files) {
  const fullPath = join(projectRoot, file.path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(file.content, null, 2) + '\n');
}

console.log(`\nCreated project "${projectName}" (${template} template):\n`);
for (const f of files) {
  console.log(`  ${projectName}/${f.path}`);
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
