/**
 * Configuration loader
 */

import type { KalConfig } from './types/types';
import { DEFAULT_RETRY_CONFIG, DEFAULT_CACHE_CONFIG } from './types/types';
import { ConfigError } from './types/errors';

export class ConfigLoader {
  static parse(jsonString: string): KalConfig {
    let raw: any;
    try {
      raw = JSON.parse(jsonString);
    } catch {
      throw new ConfigError('Invalid JSON in config file');
    }

    const substituted = this.substituteEnvVars(raw);
    this.validateRequired(substituted);
    this.validateConstraints(substituted);
    return this.fillDefaults(substituted);
  }

  private static substituteEnvVars(obj: any): any {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
        const value = process.env[varName];
        if (value === undefined) {
          throw new ConfigError(`Environment variable "${varName}" is not set`);
        }
        return value;
      });
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.substituteEnvVars(item));
    }
    if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteEnvVars(value);
      }
      return result;
    }
    return obj;
  }

  private static validateRequired(config: any): void {
    if (!config.name) throw new ConfigError('Missing required field: name');
    if (!config.version) throw new ConfigError('Missing required field: version');
    if (!config.llm?.provider) throw new ConfigError('Missing required field: llm.provider');
    if (!config.llm?.apiKey) throw new ConfigError('Missing required field: llm.apiKey');
    if (!config.llm?.defaultModel) throw new ConfigError('Missing required field: llm.defaultModel');
  }

  private static validateConstraints(config: any): void {
    const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

    if (config.engine?.logLevel !== undefined && !VALID_LOG_LEVELS.includes(config.engine.logLevel)) {
      throw new ConfigError(`Invalid engine.logLevel: "${config.engine.logLevel}". Must be one of: ${VALID_LOG_LEVELS.join(', ')}`);
    }
    if (config.engine?.maxConcurrentFlows !== undefined) {
      const v = config.engine.maxConcurrentFlows;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) {
        throw new ConfigError('engine.maxConcurrentFlows must be a positive integer');
      }
    }
    if (config.engine?.timeout !== undefined) {
      const v = config.engine.timeout;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        throw new ConfigError('engine.timeout must be a non-negative number');
      }
    }
    if (config.llm?.retry) {
      const r = config.llm.retry;
      if (r.maxRetries !== undefined && (typeof r.maxRetries !== 'number' || r.maxRetries < 0)) {
        throw new ConfigError('llm.retry.maxRetries must be a non-negative number');
      }
      if (r.initialDelayMs !== undefined && (typeof r.initialDelayMs !== 'number' || r.initialDelayMs < 0)) {
        throw new ConfigError('llm.retry.initialDelayMs must be a non-negative number');
      }
      if (r.maxDelayMs !== undefined && (typeof r.maxDelayMs !== 'number' || r.maxDelayMs < 0)) {
        throw new ConfigError('llm.retry.maxDelayMs must be a non-negative number');
      }
      if (r.backoffMultiplier !== undefined && (typeof r.backoffMultiplier !== 'number' || r.backoffMultiplier < 1)) {
        throw new ConfigError('llm.retry.backoffMultiplier must be >= 1');
      }
      if (r.jitter !== undefined && typeof r.jitter !== 'boolean') {
        throw new ConfigError('llm.retry.jitter must be a boolean');
      }
    }
    if (config.llm?.cache) {
      const c = config.llm.cache;
      if (c.enabled !== undefined && typeof c.enabled !== 'boolean') {
        throw new ConfigError('llm.cache.enabled must be a boolean');
      }
      if (c.ttl !== undefined && (typeof c.ttl !== 'number' || c.ttl < 0)) {
        throw new ConfigError('llm.cache.ttl must be a non-negative number');
      }
      if (c.maxEntries !== undefined && (typeof c.maxEntries !== 'number' || c.maxEntries < 1)) {
        throw new ConfigError('llm.cache.maxEntries must be a positive integer');
      }
    }
  }

  private static fillDefaults(config: any): KalConfig {
    return {
      name: config.name,
      version: config.version,
      engine: {
        logLevel: config.engine?.logLevel ?? 'info',
        maxConcurrentFlows: config.engine?.maxConcurrentFlows ?? 10,
        timeout: config.engine?.timeout ?? 30000,
      },
      llm: {
        provider: config.llm.provider,
        apiKey: config.llm.apiKey,
        defaultModel: config.llm.defaultModel,
        retry: { ...DEFAULT_RETRY_CONFIG, ...config.llm.retry },
        cache: { ...DEFAULT_CACHE_CONFIG, ...config.llm.cache },
      },
      image: {
        provider: config.image?.provider ?? config.llm.provider,
        apiKey: config.image?.apiKey ?? config.llm.apiKey,
      },
    };
  }
}
