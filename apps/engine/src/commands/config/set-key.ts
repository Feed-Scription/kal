import { defineCommand } from 'citty';
import { EngineHttpError } from '../../errors';
import { getCliContext, setExitCode } from '../../cli-context';
import { createConfigManager, validateApiKey, maskApiKey, promptForApiKey } from './_helpers';

export default defineCommand({
  meta: {
    name: 'set-key',
    description: 'Set an API key for a provider',
  },
  args: {
    provider: {
      type: 'positional',
      description: 'Provider name',
      required: false,
    },
    key: {
      type: 'positional',
      description: 'API key',
      required: false,
    },
  },
  async run({ args }) {
    const { io } = getCliContext();
    const configManager = createConfigManager();

    try {
      if (typeof args.provider !== 'string' || !args.provider) {
        throw new EngineHttpError('Usage: kal config set-key <provider> [key]', 400, 'CONFIG_SET_KEY_ARGS');
      }

      const provider = args.provider.toLowerCase();
      let apiKey = typeof args.key === 'string' ? args.key : undefined;

      if (!apiKey) {
        apiKey = await promptForApiKey(io, provider);
      }

      if (!apiKey || apiKey.trim().length === 0) {
        io.stdout('❌ API 密钥不能为空\n');
        setExitCode(1);
        return;
      }

      if (!validateApiKey(provider, apiKey)) {
        io.stdout(`❌ ${provider} API 密钥格式可能无效，但仍会保存\n`);
      }

      configManager.saveApiKey(provider, apiKey);

      const masked = maskApiKey(apiKey);
      io.stdout(`✅ ${provider} API 密钥已安全保存: ${masked}\n`);

      if (provider === 'openai') {
        io.stdout('\n💡 提示: 如果你使用的不是官方 OpenAI API，可以设置自定义 Base URL:\n');
        io.stdout(`  kal config set ${provider}.baseUrl https://your-custom-endpoint.com/v1\n`);
      }
      setExitCode(0);
    } catch (error) {
      io.stderr(`配置错误: ${error instanceof Error ? error.message : String(error)}\n`);
      setExitCode(1);
    }
  },
});
