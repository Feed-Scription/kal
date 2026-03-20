import { createInterface, type Interface } from 'node:readline';
import type { EngineRuntime } from '../runtime';
import { resolveBuiltinCommand, resolveChoiceSubmission } from './controls';
import { t, type TuiLocale } from './i18n';
import { renderError, renderHelp, renderOutput, renderStateTable, renderWelcome } from './renderer';

export interface LegacyTuiOptions {
  runtime: EngineRuntime;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  locale?: TuiLocale;
}

export async function runLegacyTui(options: LegacyTuiOptions): Promise<void> {
  const { runtime } = options;
  const locale = options.locale ?? 'en';
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const write = (text: string) => output.write(text);

  const c = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
  };

  const rl = createInterface({ input, output });

  const projectInfo = runtime.getProjectInfo();
  const session = runtime.getSession()!;
  write(renderWelcome(projectInfo.name, session.description ?? session.name, undefined, locale));

  const gen = runtime.createSession();
  let result = await gen.next();

  try {
    while (!result.done) {
      const event = result.value;

      switch (event.type) {
        case 'output': {
          if (event.data && Object.keys(event.data).length > 0) {
            write('\n' + renderOutput(event.data, locale) + '\n\n');
          }
          result = await gen.next(undefined);
          break;
        }

        case 'prompt': {
          let userInput: string | null = null;
          while (userInput === null) {
            const line = await readLine(rl, event.promptText);
            if (line === null) {
              await gen.return(undefined);
              return;
            }

            const action = resolveBuiltinCommand(line);
            if (action === 'quit') {
              write(t(locale, 'cmd.goodbye') + '\n');
              await gen.return(undefined);
              return;
            }
            if (action === 'state') {
              write(renderStateTable(runtime.getState(), locale) + '\n');
              continue;
            }
            if (action === 'help') {
              write(renderHelp(locale));
              continue;
            }

            userInput = line;
          }

          result = await gen.next(userInput);
          break;
        }

        case 'choice': {
          write('\n' + event.promptText + '\n');
          event.options.forEach((option, index) => {
            write(`  ${c.cyan}${index + 1}${c.reset}. ${option.label}\n`);
          });
          write('\n');

          let userChoice: string | null = null;
          while (userChoice === null) {
            const line = await readLine(rl, t(locale, 'legacy.choosePrompt'));
            if (line === null) {
              await gen.return(undefined);
              return;
            }

            if (!line || line.trim() === '') {
              write(`${c.red}${t(locale, 'legacy.enterNumber', { max: event.options.length })}${c.reset}\n`);
              continue;
            }

            const resolution = resolveChoiceSubmission(line, event.options, 0);
            if (resolution.kind === 'command' && resolution.command === 'quit') {
              write(t(locale, 'cmd.goodbye') + '\n');
              await gen.return(undefined);
              return;
            }
            if (resolution.kind === 'command' && resolution.command === 'state') {
              write(renderStateTable(runtime.getState(), locale) + '\n');
              continue;
            }
            if (resolution.kind === 'command' && resolution.command === 'help') {
              write(renderHelp(locale));
              continue;
            }

            if (resolution.kind === 'submit') {
              userChoice = resolution.value;
            } else {
              write(`${c.red}${t(locale, 'legacy.invalidChoice', { max: event.options.length })}${c.reset}\n`);
            }
          }

          result = await gen.next(userChoice);
          break;
        }

        case 'error': {
          write(renderError(event.message, locale) + '\n');
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
