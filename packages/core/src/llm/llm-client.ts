/**
 * LLM Client - OpenAI-compatible API client with retry, cache, and telemetry
 */

import type {
  ChatMessage,
  LLMConfig,
  RetryConfig,
  CacheConfig,
  TokenUsage,
} from '../types/types';
import { retry, isRetryableError } from './retry';
import { LLMCache } from './cache';
import { Telemetry } from './telemetry';

/**
 * LLM invocation options (per-call)
 */
export interface InvokeOptions {
  executionId: string;
  nodeId: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  retry?: Partial<RetryConfig>;
  cache?: Partial<CacheConfig>;
}

/**
 * LLM invocation result
 */
export interface InvokeResult {
  text: string;
  usage: TokenUsage;
  cached?: boolean;
}

type FetchFn = typeof globalThis.fetch;

/**
 * LLM Client
 */
export class LLMClient {
  private config: LLMConfig;
  private cache: LLMCache;
  private telemetry: Telemetry;
  private fetchFn: FetchFn;

  constructor(config: LLMConfig, fetchFn?: FetchFn) {
    this.config = config;
    this.cache = new LLMCache(config.cache);
    this.telemetry = new Telemetry();
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Invoke the LLM
   */
  async invoke(
    messages: ChatMessage[],
    options: InvokeOptions
  ): Promise<InvokeResult> {
    const model = options.model ?? this.config.defaultModel;
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 2048;

    // Check cache with override config
    const cacheConfig = { ...this.config.cache, ...options.cache };
    const cacheKey = LLMCache.buildKey(model, messages, temperature, maxTokens);

    const cached = this.cache.get(cacheKey, cacheConfig);
    if (cached) {
      this.telemetry.record({
        executionId: options.executionId,
        nodeId: options.nodeId,
        model,
        usage: cached.usage,
        latencyMs: 0,
        cached: true,
      });
      return { text: cached.text, usage: cached.usage, cached: true };
    }

    // Build retry config
    const retryConfig: RetryConfig = {
      ...this.config.retry,
      ...options.retry,
    };

    const startTime = Date.now();

    try {
      const result = await retry(
        () => this.callApi(model, messages, temperature, maxTokens),
        retryConfig,
        isRetryableError
      );

      const latencyMs = Date.now() - startTime;

      // Record telemetry
      this.telemetry.record({
        executionId: options.executionId,
        nodeId: options.nodeId,
        model,
        usage: result.usage,
        latencyMs,
        cached: false,
      });

      // Store in cache with override config
      this.cache.set(cacheKey, { text: result.text, usage: result.usage }, cacheConfig);

      return { text: result.text, usage: result.usage, cached: false };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      this.telemetry.recordError({
        executionId: options.executionId,
        nodeId: options.nodeId,
        model,
        latencyMs,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Get telemetry instance
   */
  getTelemetry(): Telemetry {
    return this.telemetry;
  }

  /**
   * Get cache instance
   */
  getCache(): LLMCache {
    return this.cache;
  }

  /**
   * Make the actual API call
   */
  private async callApi(
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<{ text: string; usage: TokenUsage }> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';

    const response = await this.fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error: any = new Error(
        `LLM API error: ${response.status} ${response.statusText}`
      );
      error.status = response.status;
      throw error;
    }

    const data = await response.json() as any;

    return {
      text: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }
}
