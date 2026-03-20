import { defineCommand } from 'citty';
import type { SessionDefinition } from '@kal-ai/core';
import { ensureRuntime, projectPathArg, readJsonInput, runEnvelopeCommand } from '../_shared';

export default defineCommand({
  meta: {
    name: 'set',
    description: 'Replace session.json with a full definition',
  },
  args: {
    projectPath: projectPathArg,
    file: {
      type: 'string',
      description: 'Read the session definition from a file',
    },
    json: {
      type: 'string',
      description: 'Inline session JSON',
    },
    stdin: {
      type: 'boolean',
      description: 'Read the session definition from stdin',
      default: false,
    },
  },
  async run({ args }) {
    await runEnvelopeCommand('session.set', async () => {
      const { runtime } = await ensureRuntime(typeof args.projectPath === 'string' ? args.projectPath : undefined);
      const session = await readJsonInput({
        file: typeof args.file === 'string' ? args.file : undefined,
        json: typeof args.json === 'string' ? args.json : undefined,
        stdin: args.stdin === true,
      }) as SessionDefinition;
      await runtime.saveSession(session);
      return session;
    });
  },
});
