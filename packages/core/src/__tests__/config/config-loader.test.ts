import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../../config-loader';
import type { KalConfig } from '../../types/types';

describe('ConfigLoader', () => {
  describe('JSON 解析', () => {
    it('应该能解析有效的配置 JSON', () => {
      const json = JSON.stringify({
        name: 'test-game',
        version: '1.0.0',
        engine: {
          logLevel: 'info',
          maxConcurrentFlows: 10,
          timeout: 30000,
        },
        llm: {
          provider: 'openai',
          apiKey: 'sk-test-key',
          defaultModel: 'gpt-4',
          retry: {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            backoffMultiplier: 2,
            jitter: true,
          },
          cache: {
            enabled: true,
            ttl: 3600000,
            maxEntries: 1000,
          },
        },
        image: {
          provider: 'openai',
          apiKey: 'sk-test-key',
        },
      });

      const config = ConfigLoader.parse(json);
      expect(config.name).toBe('test-game');
      expect(config.version).toBe('1.0.0');
      expect(config.llm.provider).toBe('openai');
    });

    it('应该在 JSON 无效时抛出错误', () => {
      expect(() => ConfigLoader.parse('invalid json')).toThrow();
    });
  });

  describe('环境变量替换', () => {
    const originalEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      originalEnv['TEST_API_KEY'] = process.env['TEST_API_KEY'];
      originalEnv['TEST_MODEL'] = process.env['TEST_MODEL'];
      process.env['TEST_API_KEY'] = 'my-secret-key';
      process.env['TEST_MODEL'] = 'gpt-4-turbo';
    });

    afterEach(() => {
      if (originalEnv['TEST_API_KEY'] === undefined) {
        delete process.env['TEST_API_KEY'];
      } else {
        process.env['TEST_API_KEY'] = originalEnv['TEST_API_KEY'];
      }
      if (originalEnv['TEST_MODEL'] === undefined) {
        delete process.env['TEST_MODEL'];
      } else {
        process.env['TEST_MODEL'] = originalEnv['TEST_MODEL'];
      }
    });

    it('应该替换 ${VAR} 格式的环境变量', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        engine: { logLevel: 'info', maxConcurrentFlows: 10, timeout: 30000 },
        llm: {
          provider: 'openai',
          apiKey: '${TEST_API_KEY}',
          defaultModel: '${TEST_MODEL}',
          retry: { maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
          cache: { enabled: true, ttl: 3600000, maxEntries: 1000 },
        },
        image: { provider: 'openai', apiKey: '${TEST_API_KEY}' },
      });

      const config = ConfigLoader.parse(json);
      expect(config.llm.apiKey).toBe('my-secret-key');
      expect(config.llm.defaultModel).toBe('gpt-4-turbo');
      expect(config.image.apiKey).toBe('my-secret-key');
    });

    it('应该在环境变量缺失时抛出错误', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        engine: { logLevel: 'info', maxConcurrentFlows: 10, timeout: 30000 },
        llm: {
          provider: 'openai',
          apiKey: '${NONEXISTENT_VAR}',
          defaultModel: 'gpt-4',
          retry: { maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
          cache: { enabled: true, ttl: 3600000, maxEntries: 1000 },
        },
        image: { provider: 'openai', apiKey: 'key' },
      });

      expect(() => ConfigLoader.parse(json)).toThrow('NONEXISTENT_VAR');
    });
  });

  describe('默认值填充', () => {
    const originalEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      originalEnv['TEST_API_KEY'] = process.env['TEST_API_KEY'];
      process.env['TEST_API_KEY'] = 'my-secret-key';
    });

    afterEach(() => {
      if (originalEnv['TEST_API_KEY'] === undefined) {
        delete process.env['TEST_API_KEY'];
      } else {
        process.env['TEST_API_KEY'] = originalEnv['TEST_API_KEY'];
      }
    });

    it('应该为缺失的 retry 配置填充默认值', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        engine: { logLevel: 'info', maxConcurrentFlows: 10, timeout: 30000 },
        llm: {
          provider: 'openai',
          apiKey: '${TEST_API_KEY}',
          defaultModel: 'gpt-4',
        },
        image: { provider: 'openai', apiKey: '${TEST_API_KEY}' },
      });

      const config = ConfigLoader.parse(json);
      expect(config.llm.retry).toBeDefined();
      expect(config.llm.retry.maxRetries).toBe(3);
      expect(config.llm.retry.initialDelayMs).toBe(1000);
      expect(config.llm.cache).toBeDefined();
      expect(config.llm.cache.enabled).toBe(true);
    });

    it('应该允许部分覆盖 retry 配置', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        engine: { logLevel: 'info', maxConcurrentFlows: 10, timeout: 30000 },
        llm: {
          provider: 'openai',
          apiKey: '${TEST_API_KEY}',
          defaultModel: 'gpt-4',
          retry: { maxRetries: 5 },
        },
        image: { provider: 'openai', apiKey: '${TEST_API_KEY}' },
      });

      const config = ConfigLoader.parse(json);
      expect(config.llm.retry.maxRetries).toBe(5);
      expect(config.llm.retry.initialDelayMs).toBe(1000); // default
    });
  });

  describe('必填字段校验', () => {
    it('应该在缺少 name 时抛出错误', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        engine: { logLevel: 'info', maxConcurrentFlows: 10, timeout: 30000 },
        llm: { provider: 'openai', apiKey: 'key', defaultModel: 'gpt-4' },
        image: { provider: 'openai', apiKey: 'key' },
      });

      expect(() => ConfigLoader.parse(json)).toThrow('name');
    });

    it('应该在缺少 llm.provider 时抛出错误', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        engine: { logLevel: 'info', maxConcurrentFlows: 10, timeout: 30000 },
        llm: { apiKey: 'key', defaultModel: 'gpt-4' },
        image: { provider: 'openai', apiKey: 'key' },
      });

      expect(() => ConfigLoader.parse(json)).toThrow('provider');
    });
  });

  describe('配置校验增强', () => {
    it('应该拒绝非法的 logLevel', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        engine: { logLevel: 'verbose' },
        llm: { provider: 'openai', apiKey: 'key', defaultModel: 'gpt-4' },
      });

      expect(() => ConfigLoader.parse(json)).toThrow('logLevel');
    });

    it('应该拒绝负数的 maxConcurrentFlows', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        engine: { maxConcurrentFlows: -1 },
        llm: { provider: 'openai', apiKey: 'key', defaultModel: 'gpt-4' },
      });

      expect(() => ConfigLoader.parse(json)).toThrow('maxConcurrentFlows');
    });

    it('应该拒绝负数的 retry.maxRetries', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        llm: { provider: 'openai', apiKey: 'key', defaultModel: 'gpt-4', retry: { maxRetries: -1 } },
      });

      expect(() => ConfigLoader.parse(json)).toThrow('maxRetries');
    });

    it('应该拒绝小于 1 的 backoffMultiplier', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        llm: { provider: 'openai', apiKey: 'key', defaultModel: 'gpt-4', retry: { backoffMultiplier: 0.5 } },
      });

      expect(() => ConfigLoader.parse(json)).toThrow('backoffMultiplier');
    });

    it('应该拒绝非布尔值的 cache.enabled', () => {
      const json = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        llm: { provider: 'openai', apiKey: 'key', defaultModel: 'gpt-4', cache: { enabled: 'yes' } },
      });

      expect(() => ConfigLoader.parse(json)).toThrow('cache.enabled');
    });
  });
});
