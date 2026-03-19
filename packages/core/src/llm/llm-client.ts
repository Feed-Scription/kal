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
 * Reasoning / thinking configuration (OpenRouter-compatible).
 * Controls whether and how much the model "thinks" before answering.
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface ReasoningConfig {
  /** Reasoning intensity. "none" disables thinking entirely. */
  effort?: ReasoningEffort;
  /** Explicit reasoning token budget (Anthropic / Gemini style). */
  maxTokens?: number;
  /** Hide reasoning from response while still using it internally. */
  exclude?: boolean;
}

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
  responseFormat?: 'text' | 'json';
  jsonSchema?: object;
  reasoning?: ReasoningConfig;
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
        () => this.callApi(model, messages, temperature, maxTokens, options.responseFormat, options.jsonSchema, options.reasoning),
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
    maxTokens: number,
    responseFormat?: 'text' | 'json',
    jsonSchema?: object,
    reasoning?: ReasoningConfig,
  ): Promise<{ text: string; usage: TokenUsage }> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';

    const requestBody: Record<string, any> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    // Add reasoning config for thinking models (OpenRouter-compatible)
    if (reasoning) {
      const r: Record<string, any> = {};
      if (reasoning.effort !== undefined) r.effort = reasoning.effort;
      if (reasoning.maxTokens !== undefined) r.max_tokens = reasoning.maxTokens;
      if (reasoning.exclude !== undefined) r.exclude = reasoning.exclude;
      requestBody.reasoning = r;
    }

    // Add response_format for structured output
    if (responseFormat === 'json') {
      if (jsonSchema) {
        requestBody.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: jsonSchema,
          },
        };
      } else {
        requestBody.response_format = { type: 'json_object' };
      }
    }

    const response = await this.fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let body = '';
      try { body = await response.text(); } catch {}
      const error: any = new Error(
        `LLM API error: ${response.status} ${response.statusText}${body ? ' — ' + body.slice(0, 500) : ''}`
      );
      error.status = response.status;
      throw error;
    }

    const data = await response.json() as any;

    const choice = data.choices[0];
    const rawContent = choice.message.content;
    const finishReason = choice.finish_reason;

    // Reasoning models (e.g. kimi-k2.5, DeepSeek-R1) may exhaust the token
    // budget on reasoning and return content: null with finish_reason: "length".
    if (rawContent == null) {
      if (finishReason === 'length') {
        throw new Error(
          `LLM returned empty content: model exhausted max_tokens (${maxTokens}) before producing output — ` +
          `this often happens with reasoning models that spend tokens on chain-of-thought. ` +
          `Try increasing maxTokens.`
        );
      }
      throw new Error(
        `LLM returned empty content (finish_reason: ${finishReason ?? 'unknown'})`
      );
    }

    // Normalize: some providers return parsed object in JSON mode instead of string
    const text = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

    return {
      text,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }
}
