/**
 * LLM response cache
 */

import type { CacheConfig, ChatMessage, TokenUsage } from '../types/types';

/**
 * Cached LLM response
 */
export interface CachedResponse {
  text: string;
  usage: TokenUsage;
}

interface CacheEntry {
  response: CachedResponse;
  timestamp: number;
}

/**
 * In-memory LLM cache with TTL and max entries
 */
export class LLMCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Get a cached response
   */
  get(key: string, overrideConfig?: Partial<CacheConfig>): CachedResponse | undefined {
    const effectiveConfig = { ...this.config, ...overrideConfig };

    if (!effectiveConfig.enabled) return undefined;

    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > effectiveConfig.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.response;
  }

  /**
   * Set a cached response
   */
  set(key: string, response: CachedResponse, overrideConfig?: Partial<CacheConfig>): void {
    const effectiveConfig = { ...this.config, ...overrideConfig };

    if (!effectiveConfig.enabled) return;

    // Evict oldest if at capacity
    if (this.cache.size >= effectiveConfig.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Build a cache key from LLM request parameters
   */
  static buildKey(
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number
  ): string {
    return JSON.stringify({ model, messages, temperature, maxTokens });
  }
}
