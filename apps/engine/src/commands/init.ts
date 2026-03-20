/**
 * Init command - scaffold a new KAL project
 */

import { defineCommand } from 'citty';
import { resolve, join, dirname } from 'node:path';
import { mkdir, writeFile, access } from 'node:fs/promises';
import type { EngineCliIO } from '../types';
import { getCliContext, setExitCode } from '../cli-context';
import { getTemplateFiles, type TemplateId } from '../scaffold-templates';

interface InitCommandDependencies {
  cwd: string;
  io: EngineCliIO;
}

interface ParsedInitArgs {
  projectName: string;
  template: TemplateId;
}

function parseInitArgs(tokens: string[]): ParsedInitArgs {
  let projectName: string | undefined;
  let template: TemplateId = 'minimal';

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

  const files = getTemplateFiles(parsed.template, parsed.projectName);

  // Create all directories and write files
  for (const file of files) {
    const fullPath = join(projectRoot, file.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content);
  }

  dependencies.io.stdout(`Created project "${parsed.projectName}" (${parsed.template} template):\n`);
  for (const file of files) {
    dependencies.io.stdout(`  ${parsed.projectName}/${file.path}\n`);
  }
  dependencies.io.stdout('\nNext steps:\n');
  dependencies.io.stdout(`  1. Set your API key: kal config set-key openai <your-key>\n`);
  dependencies.io.stdout(`  2. Validate: kal lint ${parsed.projectName}\n`);

  return 0;
}

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Scaffold a new KAL project',
  },
  args: {
    projectName: {
      type: 'positional',
      description: 'Name of the project to create',
      required: false,
    },
    template: {
      type: 'string',
      description: 'Project template',
      default: 'minimal',
    },
  },
  async run({ args }) {
    const { cwd, io } = getCliContext();
    const tokens: string[] = [];
    if (typeof args.projectName === 'string') {
      tokens.push(args.projectName);
    }
    if (typeof args.template === 'string') {
      tokens.push('--template', args.template);
    }
    setExitCode(await runInitCommand(tokens, { cwd, io }));
  },
});
