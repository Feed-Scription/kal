import { defineCommand } from 'citty';
import type { SessionDefinition } from '@kal-ai/core';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../_shared';
import { flowCheckArg, formatSessionWarnings, resolveFlowValidationMode, skipFlowCheckArg } from './_helpers';

export default defineCommand({
  meta: {
    name: 'set',
    description: 'Replace session.json with a full definition',
  },
  args: {
    projectPath: projectPathArg,
    file: {
      type: 'string',
      description: 'Read the session definition from a file path, or use - for stdin',
    },
    json: {
      type: 'string',
      description: 'Inline session JSON',
    },
    stdin: {
      type: 'boolean',
      description: 'Force reading the session definition from stdin',
      default: false,
    },
    'flow-check': flowCheckArg,
    'skip-flow-check': skipFlowCheckArg,
  },
  async run({ args }) {
    await runEnvelopeCommand('session.set', async () => {
      const flowValidationMode = resolveFlowValidationMode(args);
      const { runtime } = await ensureRuntime(
        typeof args.projectPath === 'string' ? args.projectPath : undefined,
        { sessionFlowValidationMode: 'warn' },
      );
      const session = await readJsonInput({
        file: typeof args.file === 'string' ? args.file : undefined,
        json: typeof args.json === 'string' ? args.json : undefined,
        stdin: args.stdin === true,
      }) as SessionDefinition;
      const result = await runtime.saveSession(session, {
        flowValidationMode,
      });
      return {
        data: session,
        warnings: formatSessionWarnings(result.warnings),
      };
    });
  },
});
