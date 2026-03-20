import { defineCommand } from 'citty';
import { getCliContext, setExitCode } from '../../cli-context';
import { createConfigManager, maskApiKey } from './_helpers';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List configured values',
  },
  async run() {
    const { io } = getCliContext();
    const configManager = createConfigManager();

    try {
      const config = configManager.loadConfig();

      io.stdout('📋 KAL-AI 配置:\n\n');

      io.stdout('🔑 API 配置:\n');
      if (config.openai?.apiKey) {
        io.stdout(`  OpenAI API Key: ${maskApiKey(config.openai.apiKey)}\n`);
      }
      if (config.openai?.baseUrl) {
        io.stdout(`  OpenAI Base URL: ${config.openai.baseUrl}\n`);
      }
      if (config.anthropic?.apiKey) {
        io.stdout(`  Anthropic API Key: ${maskApiKey(config.anthropic.apiKey)}\n`);
      }
      if (config.google?.apiKey) {
        io.stdout(`  Google API Key: ${maskApiKey(config.google.apiKey)}\n`);
      }

      if (config.preferences) {
        io.stdout('\n⚙️  用户偏好:\n');
        Object.entries(config.preferences).forEach(([key, value]) => {
          io.stdout(`  ${key}: ${JSON.stringify(value)}\n`);
        });
      }

      if (config.server) {
        io.stdout('\n🌐 服务器配置:\n');
        Object.entries(config.server).forEach(([key, value]) => {
          io.stdout(`  ${key}: ${JSON.stringify(value)}\n`);
        });
      }

      if (config.llm) {
        io.stdout('\n🤖 LLM 配置:\n');
        Object.entries(config.llm).forEach(([key, value]) => {
          io.stdout(`  ${key}: ${JSON.stringify(value)}\n`);
        });
      }

      setExitCode(0);
    } catch (error) {
      io.stderr(`配置错误: ${error instanceof Error ? error.message : String(error)}\n`);
      setExitCode(1);
    }
  },
});
