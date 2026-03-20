import { ConfigManager } from '@kal-ai/core';
import * as readline from 'readline';
import type { EngineCliIO } from '../../types';

export function createConfigManager(): ConfigManager {
  return new ConfigManager();
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '***';
  }
  return apiKey.substring(0, 4) + '***' + apiKey.substring(apiKey.length - 4);
}

export function validateApiKey(provider: string, apiKey: string): boolean {
  if (apiKey.length < 8) {
    return false;
  }
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
      return apiKey.length >= 8;
  }
}

export async function promptForInput(): Promise<string> {
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

export async function promptForApiKey(io: EngineCliIO, provider: string): Promise<string> {
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
    const stdin = process.stdin;
    stdin.setRawMode?.(true);

    io.stdout(`请输入 ${providerName} API 密钥 (输入将被隐藏): `);

    let input = '';

    const onData = (char: Buffer) => {
      const str = char.toString();

      if (str === '\r' || str === '\n') {
        stdin.setRawMode?.(false);
        stdin.removeListener('data', onData);
        rl.close();
        io.stdout('\n');
        resolve(input);
      } else if (str === '\u0003') {
        stdin.setRawMode?.(false);
        stdin.removeListener('data', onData);
        rl.close();
        io.stdout('\n❌ 操作已取消\n');
        resolve('');
      } else if (str === '\u007f' || str === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          io.stdout('\b \b');
        }
      } else if (str.charCodeAt(0) >= 32) {
        input += str;
        io.stdout('*');
      }
    };

    stdin.on('data', onData);
  });
}

export function setConfigValue(
  configManager: ConfigManager,
  io: EngineCliIO,
  key: string,
  value: string,
): void {
  if (key.endsWith('.apiKey')) {
    const provider = key.replace('.apiKey', '');
    if (!validateApiKey(provider, value)) {
      io.stdout(`⚠️  ${provider} API 密钥格式可能无效，但仍会保存\n`);
    }
    configManager.saveApiKey(provider, value);
    const masked = maskApiKey(value);
    io.stdout(`✅ ${key} 已安全保存: ${masked}\n`);
    if (provider === 'openai') {
      io.stdout('\n💡 提示: 如果你使用的不是官方 OpenAI API，可以设置自定义 Base URL:\n');
      io.stdout(`  kal config set ${provider}.baseUrl https://your-custom-endpoint.com/v1\n`);
    }
  } else {
    const keyParts = key.split('.');
    const updates: any = {};
    let current = updates;
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]!;
      current[part] = {};
      current = current[part];
    }
    current[keyParts[keyParts.length - 1]!] = value;
    configManager.updateUserConfig(updates);
    io.stdout(`✅ 配置已更新: ${key} = ${value}\n`);
  }
}
