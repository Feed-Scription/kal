/**
 * Shared utility to load user config (.kal/config.env) and set env vars.
 * All CLI commands should call this before doing any work.
 */

import { ConfigManager } from '@kal-ai/core';

export function ensureUserConfig(): void {
  const configManager = new ConfigManager();
  const userConfig = configManager.loadConfig();

  Object.keys(userConfig).forEach((provider) => {
    if (typeof userConfig[provider] === 'object' && userConfig[provider]) {
      const providerConfig = userConfig[provider] as any;
      if (providerConfig.apiKey) {
        const envKey = `${provider.toUpperCase()}_API_KEY`;
        if (!process.env[envKey]) {
          process.env[envKey] = providerConfig.apiKey;
        }
      }
      if (providerConfig.baseUrl) {
        const envKey = `${provider.toUpperCase()}_BASE_URL`;
        if (!process.env[envKey]) {
          process.env[envKey] = providerConfig.baseUrl;
        }
      }
    }
  });
}
