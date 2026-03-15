/**
 * Init command - scaffold a new KAL project
 */

import { resolve, join } from 'node:path';
import { mkdir, writeFile, access } from 'node:fs/promises';
import type { EngineCliIO } from '../types';

interface InitCommandDependencies {
  cwd: string;
  io: EngineCliIO;
}

interface ParsedInitArgs {
  projectName: string;
  template: 'minimal' | 'game';
}

function parseInitArgs(tokens: string[]): ParsedInitArgs {
  let projectName: string | undefined;
  let template: 'minimal' | 'game' = 'minimal';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token === '--template') {
      const value = tokens[i + 1];
      if (value === 'minimal' || value === 'game') {
        template = value;
        i++;
      } else {
        throw new Error(`Invalid template: ${value ?? '<missing>'}. Expected "minimal" or "game".`);
      }
      continue;
    }

    if (token === '--help' || token === '-h') {
      throw new Error('HELP');
    }

    if (token.startsWith('--')) {
      throw new Error(`Unknown flag: ${token}`);
    }

    if (!projectName) {
      projectName = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  if (!projectName) {
    throw new Error('Missing project name. Usage: kal init <project-name> [--template minimal|game]');
  }

  return { projectName, template };
}

export async function runInitCommand(
  tokens: string[],
  dependencies: InitCommandDependencies,
): Promise<number> {
  let parsed: ParsedInitArgs;
  try {
    parsed = parseInitArgs(tokens);
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'HELP') {
      dependencies.io.stdout(
        'Usage: kal init <project-name> [--template minimal|game]\n\n' +
        'Templates:\n' +
        '  minimal  - Bare project with one example flow (default)\n' +
        '  game     - Game project with session, state, and example flows\n'
      );
      return 0;
    }
    dependencies.io.stderr(`Error: ${msg}\n`);
    return 2;
  }

  const projectRoot = resolve(dependencies.cwd, parsed.projectName);

  // Check if directory already exists
  try {
    await access(projectRoot);
    dependencies.io.stderr(`Error: Directory "${parsed.projectName}" already exists\n`);
    return 1;
  } catch {
    // Directory doesn't exist, good
  }

  const createdFiles: string[] = [];

  await mkdir(projectRoot, { recursive: true });
  await mkdir(join(projectRoot, 'flow'), { recursive: true });

  // kal_config.json
  const config = {
    name: parsed.projectName,
    version: '0.1.0',
    llm: {
      provider: 'openai',
      defaultModel: 'gpt-4o-mini',
      apiKey: '${OPENAI_API_KEY}',
    },
  };
  await writeFile(join(projectRoot, 'kal_config.json'), JSON.stringify(config, null, 2) + '\n');
  createdFiles.push('kal_config.json');

  if (parsed.template === 'game') {
    await scaffoldGameTemplate(projectRoot, createdFiles);
  } else {
    await scaffoldMinimalTemplate(projectRoot, createdFiles);
  }

  dependencies.io.stdout(`Created project "${parsed.projectName}" (${parsed.template} template):\n`);
  for (const file of createdFiles) {
    dependencies.io.stdout(`  ${parsed.projectName}/${file}\n`);
  }
  dependencies.io.stdout('\nNext steps:\n');
  dependencies.io.stdout(`  1. Set your API key: kal config set-key openai <your-key>\n`);
  dependencies.io.stdout(`  2. Validate: kal lint ${parsed.projectName}\n`);

  return 0;
}

async function scaffoldMinimalTemplate(projectRoot: string, createdFiles: string[]): Promise<void> {
  // initial_state.json
  await writeFile(join(projectRoot, 'initial_state.json'), '{}\n');
  createdFiles.push('initial_state.json');

  // Example flow
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
  };
  await writeFile(join(projectRoot, 'flow', 'example.json'), JSON.stringify(exampleFlow, null, 2) + '\n');
  createdFiles.push('flow/example.json');
}

async function scaffoldGameTemplate(projectRoot: string, createdFiles: string[]): Promise<void> {
  // initial_state.json with example game state
  const initialState = {
    playerName: { type: 'string', value: '' },
    score: { type: 'number', value: 0 },
    turn: { type: 'number', value: 1 },
  };
  await writeFile(join(projectRoot, 'initial_state.json'), JSON.stringify(initialState, null, 2) + '\n');
  createdFiles.push('initial_state.json');

  // Intro flow
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
        {
          id: 'llm',
          type: 'GenerateText',
          config: {},
        },
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
  await writeFile(join(projectRoot, 'flow', 'intro.json'), JSON.stringify(introFlow, null, 2) + '\n');
  createdFiles.push('flow/intro.json');

  // Session
  const session = {
    schemaVersion: '1.0',
    entryStep: 'intro',
    steps: [
      { id: 'intro', type: 'RunFlow', flowRef: 'intro', next: 'end' },
      { id: 'end', type: 'End', message: 'Game over!' },
    ],
  };
  await writeFile(join(projectRoot, 'session.json'), JSON.stringify(session, null, 2) + '\n');
  createdFiles.push('session.json');
}
