import { defineCommand } from 'citty';
import { runTui } from '../tui/tui';
import { EngineHttpError } from '../errors';
import { setExitCode } from '../cli-context';
import { ensureRuntime, projectPathArg } from './_shared';

export default defineCommand({
  meta: {
    name: 'play',
    description: 'Run the interactive TUI player',
  },
  args: {
    projectPath: projectPathArg,
  },
  async run({ args }) {
    const { runtime } = await ensureRuntime(args.projectPath);
    if (!runtime.hasSession()) {
      throw new EngineHttpError('项目缺少 session.json，无法启动 play 模式', 400, 'NO_SESSION');
    }
    await runTui({ runtime });
    setExitCode(0);
  },
});
