import { defineCommand } from 'citty';
import { EngineHttpError } from '../errors';
import { getCliContext, setExitCode } from '../cli-context';
import { ensureRuntime, projectPathArg } from './_shared';

export default defineCommand({
  meta: {
    name: 'serve',
    description: 'Start the engine HTTP server',
  },
  args: {
    projectPath: projectPathArg,
    host: {
      type: 'string',
      description: 'Host to bind',
      default: '127.0.0.1',
    },
    port: {
      type: 'string',
      description: 'Port to bind',
      default: '3000',
    },
  },
  async run({ args }) {
    const dependencies = getCliContext();
    const { runtime } = await ensureRuntime(args.projectPath);
    const port = Number(args.port ?? '3000');
    if (!Number.isFinite(port) || port < 0) {
      throw new EngineHttpError('CLI port must be a non-negative number', 400, 'CLI_PORT_INVALID', { port: args.port });
    }
    const server = await dependencies.startServer({
      runtime,
      host: typeof args.host === 'string' ? args.host : '127.0.0.1',
      port,
    });
    dependencies.io.stdout(`Engine server listening on ${server.url}\n`);
    await dependencies.waitForShutdown(server, dependencies.io);
    setExitCode(0);
  },
});
