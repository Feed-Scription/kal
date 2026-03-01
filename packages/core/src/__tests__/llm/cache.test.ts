import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMCache } from '../../llm/cache';
import type { CacheConfig } from '../../types/types';

describe('LLMCache', () => {
  let cache: LLMCache;
  const defaultConfig: CacheConfig = {
    enabled: true,
    ttl: 60000,
    maxEntries: 3,
  };

  beforeEach(() => {
    cache = new LLMCache(defaultConfig);
  });

  it('应该在缓存未命中时返回 undefined', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('应该能存储和获取缓存', () => {
    cache.set('key1', { text: 'hello', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
    const result = cache.get('key1');
    expect(result).toBeDefined();
    expect(result!.text).toBe('hello');
  });

  it('应该在 TTL 过期后返回 undefined', () => {
    vi.useFakeTimers();
    cache.set('key1', { text: 'hello', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });

    vi.advanceTimersByTime(60001);
    expect(cache.get('key1')).toBeUndefined();

    vi.useRealTimers();
  });

  it('应该在达到 maxEntries 时淘汰最旧的条目', () => {
    cache.set('key1', { text: '1', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
    cache.set('key2', { text: '2', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
    cache.set('key3', { text: '3', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
    cache.set('key4', { text: '4', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });

    expect(cache.get('key1')).toBeUndefined(); // evicted
    expect(cache.get('key4')).toBeDefined();
  });

  it('应该在 disabled 时不缓存', () => {
    const disabledCache = new LLMCache({ ...defaultConfig, enabled: false });
    disabledCache.set('key1', { text: 'hello', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
    expect(disabledCache.get('key1')).toBeUndefined();
  });

  it('应该能生成缓存 key', () => {
    const key = LLMCache.buildKey('gpt-4', [{ role: 'user', content: 'hello' }], 0.7, 100);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('相同参数应该生成相同的缓存 key', () => {
    const messages = [{ role: 'user' as const, content: 'hello' }];
    const key1 = LLMCache.buildKey('gpt-4', messages, 0.7, 100);
    const key2 = LLMCache.buildKey('gpt-4', messages, 0.7, 100);
    expect(key1).toBe(key2);
  });

  it('不同参数应该生成不同的缓存 key', () => {
    const messages = [{ role: 'user' as const, content: 'hello' }];
    const key1 = LLMCache.buildKey('gpt-4', messages, 0.7, 100);
    const key2 = LLMCache.buildKey('gpt-4', messages, 0.8, 100);
    expect(key1).not.toBe(key2);
  });

  it('应该能清空缓存', () => {
    cache.set('key1', { text: '1', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
    cache.clear();
    expect(cache.get('key1')).toBeUndefined();
  });
});
