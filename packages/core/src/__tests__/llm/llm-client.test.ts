import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../../llm/llm-client';
import type { ChatMessage, LLMConfig } from '../../types/types';
import { DEFAULT_RETRY_CONFIG, DEFAULT_CACHE_CONFIG } from '../../types/types';

describe('LLMClient', () => {
  const defaultConfig: LLMConfig = {
    provider: 'openai',
    apiKey: 'test-key',
    defaultModel: 'gpt-4',
    retry: { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 10, maxDelayMs: 50 },
    cache: { ...DEFAULT_CACHE_CONFIG, enabled: false },
  };

  const messages: ChatMessage[] = [
    { role: 'user', content: 'Hello' },
  ];

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hi there!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });
  });

  it('应该能调用 LLM 并返回结果', async () => {
    const client = new LLMClient(defaultConfig, mockFetch);

    const result = await client.invoke(messages, {
      executionId: 'exec-1',
      nodeId: 'node-1',
    });

    expect(result.text).toBe('Hi there!');
    expect(result.usage.totalTokens).toBe(15);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('应该使用正确的请求格式', async () => {
    const client = new LLMClient(defaultConfig, mockFetch);

    await client.invoke(messages, {
      executionId: 'exec-1',
      nodeId: 'node-1',
      model: 'gpt-4-turbo',
      temperature: 0.5,
      maxTokens: 200,
    });

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/chat/completions');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('gpt-4-turbo');
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(200);
  });

  it('应该在失败时重试', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'retried' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

    const client = new LLMClient(defaultConfig, mockFetch);
    const result = await client.invoke(messages, {
      executionId: 'exec-1',
      nodeId: 'node-1',
    });

    expect(result.text).toBe('retried');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('应该使用缓存', async () => {
    const cacheConfig = { ...defaultConfig, cache: { enabled: true, ttl: 60000, maxEntries: 100 } };
    const client = new LLMClient(cacheConfig, mockFetch);

    const opts = { executionId: 'exec-1', nodeId: 'node-1' };
    const result1 = await client.invoke(messages, opts);
    const result2 = await client.invoke(messages, opts);

    expect(result1.text).toBe('Hi there!');
    expect(result2.text).toBe('Hi there!');
    expect(result2.cached).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce(); // Only one actual call
  });

  it('应该记录 telemetry', async () => {
    const client = new LLMClient(defaultConfig, mockFetch);

    await client.invoke(messages, {
      executionId: 'exec-1',
      nodeId: 'node-1',
    });

    const records = client.getTelemetry().getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.success).toBe(true);
    expect(records[0]!.model).toBe('gpt-4');
  });

  it('应该在 API 返回错误时记录 telemetry', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve('Invalid request'),
    });

    const client = new LLMClient({
      ...defaultConfig,
      retry: { ...defaultConfig.retry, maxRetries: 0 },
    }, mockFetch);

    await expect(
      client.invoke(messages, { executionId: 'exec-1', nodeId: 'node-1' })
    ).rejects.toThrow();

    const records = client.getTelemetry().getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.success).toBe(false);
  });

  it('应该支持节点级 retry 覆盖', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const client = new LLMClient(defaultConfig, mockFetch);

    await expect(
      client.invoke(messages, {
        executionId: 'exec-1',
        nodeId: 'node-1',
        retry: { maxRetries: 1 },
      })
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it('应该支持节点级 cache 覆盖', async () => {
    const cacheConfig = { ...defaultConfig, cache: { enabled: true, ttl: 60000, maxEntries: 100 } };
    const client = new LLMClient(cacheConfig, mockFetch);

    const opts = { executionId: 'exec-1', nodeId: 'node-1', cache: { enabled: false } };
    await client.invoke(messages, opts);
    await client.invoke(messages, opts);

    expect(mockFetch).toHaveBeenCalledTimes(2); // No caching
  });
});
