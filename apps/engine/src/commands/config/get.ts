import { defineCommand } from 'citty';
import { EngineHttpError } from '../../errors';
import { getCliContext, setExitCode } from '../../cli-context';
import { createConfigManager, maskApiKey } from './_helpers';

export default defineCommand({
  meta: {
    name: 'get',
    description: 'Get a config value',
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
        throw new EngineHttpError('Usage: kal config get <key>', 400, 'CONFIG_GET_ARGS');
      }

      const config = configManager.loadConfig();
      const keyParts = args.key.split('.');
      let value: any = config;

      for (const part of keyParts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          io.stdout(`配置项 '${args.key}' 不存在\n`);
          setExitCode(1);
          return;
        }
      }

      if (args.key.toLowerCase().includes('key') || args.key.toLowerCase().includes('secret')) {
        const maskedValue = typeof value === 'string' && value.length > 8
          ? maskApiKey(value)
          : '***';
        io.stdout(`${args.key}: ${maskedValue}\n`);
      } else {
        io.stdout(`${args.key}: ${JSON.stringify(value, null, 2)}\n`);
      }
      setExitCode(0);
    } catch (error) {
      io.stderr(`配置错误: ${error instanceof Error ? error.message : String(error)}\n`);
      setExitCode(1);
    }
  },
});
