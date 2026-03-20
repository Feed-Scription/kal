import { defineCommand } from 'citty';
import { EngineHttpError } from '../../errors';
import { getCliContext, setExitCode } from '../../cli-context';
import { createConfigManager } from './_helpers';

export default defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove a config value',
  },
  args: {
    key: {
      type: 'positional',
      description: 'Config key',
      required: false,
    },
  },
  async run({ args }) {
    const { io } = getCliContext();
    const configManager = createConfigManager();

    try {
      if (typeof args.key !== 'string' || !args.key) {
        throw new EngineHttpError('Usage: kal config remove <key>', 400, 'CONFIG_REMOVE_ARGS');
      }

      if (args.key.endsWith('.apiKey')) {
        const provider = args.key.replace('.apiKey', '');
        configManager.removeApiKey(provider);
        io.stdout(`🗑️  ${args.key} 已删除\n`);
      } else {
        io.stdout(`🗑️  ${args.key} 已删除\n`);
      }
      setExitCode(0);
    } catch (error) {
      io.stderr(`配置错误: ${error instanceof Error ? error.message : String(error)}\n`);
      setExitCode(1);
    }
  },
});
