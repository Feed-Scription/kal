import { ConfigManager } from '@kal-ai/core';
import * as readline from 'readline';
import { EngineHttpError } from '../errors';
import type { EngineCliIO } from '../types';

export class ConfigCommand {
  private configManager: ConfigManager;
  private io: EngineCliIO;

  constructor(io: EngineCliIO) {
    this.configManager = new ConfigManager();
    this.io = io;
  }

  async execute(args: string[]): Promise<number> {
    const [subCommand, ...params] = args;

    if (!subCommand) {
      this.printConfigUsage();
      return 1;
    }

    try {
      switch (subCommand) {
        case 'init':
          return await this.initConfig();
        case 'set':
          return await this.setConfig(params);
        case 'get':
          return await this.getConfig(params);
        case 'list':
          return await this.listConfig();
        case 'set-key':
          return await this.setApiKey(params);
        case 'remove-key':
          return await this.removeApiKey(params);
        default:
          throw new EngineHttpError(`Unknown config command: ${subCommand}`, 400, 'CONFIG_UNKNOWN_COMMAND', { subCommand });
      }
    } catch (error) {
      this.io.stderr(`配置错误: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  private printConfigUsage(): void {
    this.io.stderr([
      'KAL-AI 配置管理',
      '',
      'Usage:',
      '  kal config init                           # 初始化配置文件',
      '  kal config set <key> <value>              # 设置配置项',
      '  kal config get <key>                      # 获取配置项',
      '  kal config list                           # 列出所有配置',
      '  kal config set-key <provider> [key]       # 安全设置 API 密钥',
      '  kal config remove-key <provider>          # 删除 API 密钥',
      '',
      '支持任意 LLM 提供商，常见的包括:',
      '  openai, anthropic, google, claude, gemini, qwen, deepseek, moonshot, 等',
      '',
      'Examples:',
      '  kal config init',
      '  kal config set-key openai',
      '  kal config set-key deepseek sk-xxx...',
      '  kal config set-key moonshot',
      '  kal config set preferences.theme dark',
      '  kal config get openai.apiKey',
      '  kal config list',
    ].join('\n') + '\n');
  }

  private async initConfig(): Promise<number> {
    this.io.stdout('🔧 初始化 KAL-AI 配置...\n');

    this.configManager.initializeConfig();

    this.io.stdout(`✅ 配置文件已创建: ${this.configManager.getConfigDir()}\n`);

    // 询问用户是否要立即设置 API 密钥
    this.io.stdout('\n是否要现在设置 API 密钥？(y/n): ');

    const answer = await this.promptForInput();
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      this.io.stdout('\n请输入你要使用的 LLM 提供商名称 (如 openai, deepseek, moonshot 等): ');
      const provider = await this.promptForInput();

      if (provider && provider.trim()) {
        await this.setApiKey([provider.trim()]);

        // 询问是否需要设置自定义 Base URL
        this.io.stdout('\n是否需要设置自定义 API 端点？(y/n): ');
        const useCustomUrl = await this.promptForInput();

        if (useCustomUrl.toLowerCase() === 'y' || useCustomUrl.toLowerCase() === 'yes') {
          this.io.stdout('请输入 API 端点 URL: ');
          const baseUrl = await this.promptForInput();
          if (baseUrl && baseUrl.trim()) {
            await this.setConfig([`${provider}.baseUrl`, baseUrl.trim()]);
          }
        }
      }
    }

    this.io.stdout('\n🎉 配置完成！现在你可以运行:\n');
    this.io.stdout('  kal play examples/dnd-adventure\n');

    return 0;
  }

  private async promptForInput(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question('', (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  private async setConfig(params: string[]): Promise<number> {
    if (params.length < 2) {
      throw new EngineHttpError('Usage: kal config set <key> <value>', 400, 'CONFIG_SET_ARGS');
    }

    const [key, ...valueParts] = params;
    const value = valueParts.join(' ');

    // 解析嵌套键 (如 preferences.theme)
    const keyParts = key.split('.');
    const updates: any = {};
    let current = updates;

    for (let i = 0; i < keyParts.length - 1; i++) {
      current[keyParts[i]] = {};
      current = current[keyParts[i]];
    }
    current[keyParts[keyParts.length - 1]] = value;

    this.configManager.updateUserConfig(updates);
    this.io.stdout(`✅ 配置已更新: ${key} = ${value}\n`);

    return 0;
  }

  private async getConfig(params: string[]): Promise<number> {
    if (params.length < 1) {
      throw new EngineHttpError('Usage: kal config get <key>', 400, 'CONFIG_GET_ARGS');
    }

    const key = params[0];
    const config = this.configManager.loadConfig();

    // 解析嵌套键
    const keyParts = key.split('.');
    let value: any = config;

    for (const part of keyParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        this.io.stdout(`配置项 '${key}' 不存在\n`);
        return 1;
      }
    }

    // 隐藏敏感信息
    if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
      const maskedValue = typeof value === 'string' && value.length > 8
        ? value.substring(0, 4) + '***' + value.substring(value.length - 4)
        : '***';
      this.io.stdout(`${key}: ${maskedValue}\n`);
    } else {
      this.io.stdout(`${key}: ${JSON.stringify(value, null, 2)}\n`);
    }

    return 0;
  }

  private async listConfig(): Promise<number> {
    const config = this.configManager.loadConfig();

    this.io.stdout('📋 KAL-AI 配置:\n\n');

    // API 配置
    this.io.stdout('🔑 API 配置:\n');
    if (config.openai?.apiKey) {
      const masked = this.maskApiKey(config.openai.apiKey);
      this.io.stdout(`  OpenAI API Key: ${masked}\n`);
    }
    if (config.openai?.baseUrl) {
      this.io.stdout(`  OpenAI Base URL: ${config.openai.baseUrl}\n`);
    }
    if (config.anthropic?.apiKey) {
      const masked = this.maskApiKey(config.anthropic.apiKey);
      this.io.stdout(`  Anthropic API Key: ${masked}\n`);
    }
    if (config.google?.apiKey) {
      const masked = this.maskApiKey(config.google.apiKey);
      this.io.stdout(`  Google API Key: ${masked}\n`);
    }

    // 用户偏好
    if (config.preferences) {
      this.io.stdout('\n⚙️  用户偏好:\n');
      Object.entries(config.preferences).forEach(([key, value]) => {
        this.io.stdout(`  ${key}: ${JSON.stringify(value)}\n`);
      });
    }

    // 服务器配置
    if (config.server) {
      this.io.stdout('\n🌐 服务器配置:\n');
      Object.entries(config.server).forEach(([key, value]) => {
        this.io.stdout(`  ${key}: ${JSON.stringify(value)}\n`);
      });
    }

    // LLM 配置
    if (config.llm) {
      this.io.stdout('\n🤖 LLM 配置:\n');
      Object.entries(config.llm).forEach(([key, value]) => {
        this.io.stdout(`  ${key}: ${JSON.stringify(value)}\n`);
      });
    }

    return 0;
  }

  private async setApiKey(params: string[]): Promise<number> {
    if (params.length < 1) {
      throw new EngineHttpError('Usage: kal config set-key <provider> [key]', 400, 'CONFIG_SET_KEY_ARGS');
    }

    const provider = params[0].toLowerCase();
    let apiKey = params[1];

    // 如果没有提供密钥，则提示用户输入
    if (!apiKey) {
      apiKey = await this.promptForApiKey(provider);
    }

    if (!apiKey || apiKey.trim().length === 0) {
      this.io.stdout('❌ API 密钥不能为空\n');
      return 1;
    }

    // 基本验证密钥格式（不限定特定提供商）
    if (!this.validateApiKey(provider, apiKey)) {
      this.io.stdout(`❌ ${provider} API 密钥格式可能无效，但仍会保存\n`);
    }

    // 保存加密的密钥
    this.configManager.saveApiKey(provider, apiKey);

    const masked = this.maskApiKey(apiKey);
    this.io.stdout(`✅ ${provider} API 密钥已安全保存: ${masked}\n`);

    // 提供一些常见的配置提示
    if (provider === 'openai') {
      this.io.stdout('\n💡 提示: 如果你使用的不是官方 OpenAI API，可以设置自定义 Base URL:\n');
      this.io.stdout(`  kal config set ${provider}.baseUrl https://your-custom-endpoint.com/v1\n`);
    }

    return 0;
  }

  private async removeApiKey(params: string[]): Promise<number> {
    if (params.length < 1) {
      throw new EngineHttpError('Usage: kal config remove-key <provider>', 400, 'CONFIG_REMOVE_KEY_ARGS');
    }

    const provider = params[0].toLowerCase();

    this.configManager.removeApiKey(provider);
    this.io.stdout(`🗑️  ${provider} API 密钥已删除\n`);

    return 0;
  }

  private async promptForApiKey(provider: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const providerNames: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
    };

    const providerName = providerNames[provider] || provider;

    return new Promise((resolve) => {
      // 隐藏输入
      const stdin = process.stdin;
      stdin.setRawMode?.(true);

      this.io.stdout(`请输入 ${providerName} API 密钥 (输入将被隐藏): `);

      let input = '';

      const onData = (char: Buffer) => {
        const str = char.toString();

        if (str === '\r' || str === '\n') {
          // 回车键
          stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          rl.close();
          this.io.stdout('\n');
          resolve(input);
        } else if (str === '\u0003') {
          // Ctrl+C
          stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          rl.close();
          this.io.stdout('\n❌ 操作已取消\n');
          resolve('');
        } else if (str === '\u007f' || str === '\b') {
          // 退格键
          if (input.length > 0) {
            input = input.slice(0, -1);
            this.io.stdout('\b \b');
          }
        } else if (str.charCodeAt(0) >= 32) {
          // 可打印字符
          input += str;
          this.io.stdout('*');
        }
      };

      stdin.on('data', onData);
    });
  }

  private validateApiKey(provider: string, apiKey: string): boolean {
    // 基本长度检查
    if (apiKey.length < 8) {
      return false;
    }

    // 针对已知提供商的格式检查，但不强制要求
    switch (provider.toLowerCase()) {
      case 'openai':
        return apiKey.startsWith('sk-') && apiKey.length > 20;
      case 'anthropic':
        return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
      case 'google':
      case 'gemini':
        return apiKey.length > 10;
      case 'deepseek':
        return apiKey.startsWith('sk-') && apiKey.length > 20;
      case 'moonshot':
        return apiKey.startsWith('sk-') && apiKey.length > 20;
      case 'qwen':
        return apiKey.length > 10;
      default:
        // 对于未知提供商，只做基本检查
        return apiKey.length >= 8;
    }
  }

  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) {
      return '***';
    }
    return apiKey.substring(0, 4) + '***' + apiKey.substring(apiKey.length - 4);
  }
}