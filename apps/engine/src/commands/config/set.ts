import { defineCommand } from 'citty';
import { EngineHttpError } from '../../errors';
import { getCliContext, setExitCode } from '../../cli-context';
import { createConfigManager, setConfigValue } from './_helpers';

export default defineCommand({
  meta: {
    name: 'set',
    description: 'Set a config value',
  },
  args: {
    key: {
      type: 'positional',
      description: 'Config key',
      required: false,
    },
    value: {
      type: 'positional',
      description: 'Config value',
      required: false,
    },
  },
  async run({ args }) {
    const { io } = getCliContext();
    const configManager = createConfigManager();

    try {
      if (typeof args.key !== 'string' || !args.key || typeof args.value !== 'string') {
        throw new EngineHttpError('Usage: kal config set <key> <value>', 400, 'CONFIG_SET_ARGS');
      }
      setConfigValue(configManager, io, args.key, args.value);
      setExitCode(0);
    } catch (error) {
      io.stderr(`配置错误: ${error instanceof Error ? error.message : String(error)}\n`);
      setExitCode(1);
    }
  },
});
