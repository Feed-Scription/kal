/**
 * Retry mechanism with exponential backoff
 */

import type { RetryConfig } from '../types/types';

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);

  if (config.jitter) {
    return cappedDelay * (0.5 + Math.random() * 0.5);
  }

  return cappedDelay;
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  isRetryable: (error: any) => boolean = isRetryableError
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= config.maxRetries || !isRetryable(error)) {
        throw error;
      }

      const delay = calculateDelay(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable (5xx, 429, network errors)
 */
export function isRetryableError(error: any): boolean {
  // HTTP status code based
  if (typeof error?.status === 'number') {
    const status = error.status;
    return status === 429 || (status >= 500 && status < 600);
  }

  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Node.js network error codes
  const networkCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE'];
  if (typeof error?.code === 'string' && networkCodes.includes(error.code)) {
    return true;
  }

  return false;
}
