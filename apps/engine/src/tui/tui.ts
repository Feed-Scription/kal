/**
 * TUI main loop — interactive terminal interface for KAL-AI flows
 */

import { createInterface, type Interface } from 'node:readline';
import type { EngineRuntime } from '../runtime';
import { renderOutput, renderStateTable, renderWelcome, renderHelp, renderError } from './renderer';

export interface TuiOptions {
  runtime: EngineRuntime;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export async function runTui(options: TuiOptions): Promise<void> {
  const { runtime } = options;
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const write = (text: string) => output.write(text);

  // Color helpers
  const c = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
  };

  const rl = createInterface({ input, output });

  const projectInfo = runtime.getProjectInfo();
  const session = runtime.getSession()!;
  write(renderWelcome(projectInfo.name, session.description ?? session.name));

  const gen = runtime.createSession();
  let result = await gen.next();

  try {
    while (!result.done) {
      const event = result.value;

      switch (event.type) {
        case 'output': {
          if (event.data && Object.keys(event.data).length > 0) {
            write('\n' + renderOutput(event.data) + '\n\n');
          }
          result = await gen.next(undefined);
          break;
        }

        case 'prompt': {
          // Loop until we get valid user input (not a built-in command)
          let userInput: string | null = null;
          while (userInput === null) {
            const line = await readLine(rl, event.promptText);
            if (line === null) {
              await gen.return(undefined);
              return;
            }

            if (line === '/quit' || line === '/exit') {
              write('再见!\n');
              await gen.return(undefined);
              return;
            }
            if (line === '/state') {
              write(renderStateTable(runtime.getState()) + '\n');
              continue;
            }
            if (line === '/help') {
              write(renderHelp());
              continue;
            }

            userInput = line;
          }

          result = await gen.next(userInput);
          break;
        }

        case 'choice': {
          write('\n' + event.promptText + '\n');
          event.options.forEach((opt, i) => {
            write(`  ${c.cyan}${i + 1}${c.reset}. ${opt.label}\n`);
          });
          write('\n');

          let userChoice: string | null = null;
          while (userChoice === null) {
            const line = await readLine(rl, '请选择 (输入数字)');
            if (line === null) {
              await gen.return(undefined);
              return;
            }

            // 支持内置命令
            if (line === '/quit' || line === '/exit') {
              write('再见!\n');
              await gen.return(undefined);
              return;
            }
            if (line === '/state') {
              write(renderStateTable(runtime.getState()) + '\n');
              continue;
            }
            if (line === '/help') {
              write(renderHelp());
              continue;
            }

            const num = parseInt(line, 10);
            if (num >= 1 && num <= event.options.length) {
              userChoice = event.options[num - 1]!.value;
            } else {
              write(`${c.red}无效选择，请输入 1-${event.options.length} 之间的数字${c.reset}\n`);
            }
          }

          result = await gen.next(userChoice);
          break;
        }

        case 'error': {
          write(renderError(event.message) + '\n');
          return;
        }

        case 'end': {
          if (event.message) {
            write('\n' + event.message + '\n');
          }
          return;
        }
      }
    }
  } finally {
    rl.close();
  }
}

/**
 * Read a single line from the user, returning null on EOF.
 */
function readLine(rl: Interface, promptText?: string): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const onLine = (line: string) => {
      if (resolved) return;
      resolved = true;
      rl.removeListener('close', onClose);
      const trimmed = line.trim();
      resolve(trimmed || null);
    };
    const onClose = () => {
      if (resolved) return;
      resolved = true;
      rl.removeListener('line', onLine);
      resolve(null);
    };
    rl.once('line', onLine);
    rl.once('close', onClose);
    const prompt = promptText ? `${promptText}\n> ` : '> ';
    rl.setPrompt(prompt);
    rl.prompt();
  });
}
