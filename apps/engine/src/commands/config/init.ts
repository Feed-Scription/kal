import { defineCommand } from 'citty';
import { getCliContext, setExitCode } from '../../cli-context';
import { createConfigManager, promptForInput, promptForApiKey, setConfigValue } from './_helpers';

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize the user config file',
  },
  async run() {
    const { io } = getCliContext();
    const configManager = createConfigManager();

    try {
      io.stdout('🔧 初始化 KAL-AI 配置...\n');
      configManager.initializeConfig();
      io.stdout(`✅ 配置文件已创建: ${configManager.getConfigDir()}\n`);

      io.stdout('\n是否要现在设置 API 密钥？(y/n): ');
      const answer = await promptForInput();
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        io.stdout('\n请输入你要使用的 LLM 提供商名称 (如 openai, deepseek, moonshot 等): ');
        const provider = await promptForInput();

        if (provider && provider.trim()) {
          io.stdout(`请输入 ${provider} 的 API 密钥: `);
          const apiKey = await promptForApiKey(io, provider);

          if (apiKey && apiKey.trim()) {
            setConfigValue(configManager, io, `${provider}.apiKey`, apiKey);

            io.stdout('\n是否需要设置自定义 API 端点？(y/n): ');
            const useCustomUrl = await promptForInput();

            if (useCustomUrl.toLowerCase() === 'y' || useCustomUrl.toLowerCase() === 'yes') {
              io.stdout('请输入 API 端点 URL: ');
              const baseUrl = await promptForInput();
              if (baseUrl && baseUrl.trim()) {
                setConfigValue(configManager, io, `${provider}.baseUrl`, baseUrl.trim());
              }
            }
          }
        }
      }

      io.stdout('\n🎉 配置完成！现在你可以运行:\n');
      io.stdout('  kal play examples/dnd-adventure\n');
      setExitCode(0);
    } catch (error) {
      io.stderr(`配置错误: ${error instanceof Error ? error.message : String(error)}\n`);
      setExitCode(1);
    }
  },
});
