import { describe, it, expect, vi } from 'vitest';
import { retry, isRetryableError } from '../../llm/retry';
import type { RetryConfig } from '../../types/types';

describe('retry', () => {
  const defaultConfig: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    jitter: false,
  };

  it('应该在第一次成功时直接返回', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn, defaultConfig);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应该在失败后重试并最终成功', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('5xx'))
      .mockRejectedValueOnce(new Error('5xx'))
      .mockResolvedValue('success');

    const result = await retry(fn, { ...defaultConfig }, (e) => true);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('应该在达到最大重试次数后抛出错误', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retry(fn, { ...defaultConfig, maxRetries: 2 }, () => true)
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('应该对不可重试错误立即抛出', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('4xx'));

    await expect(
      retry(fn, defaultConfig, () => false)
    ).rejects.toThrow('4xx');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应该使用指数退避', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      delays.push(ms ?? 0);
      fn();
      return 0 as any;
    });

    const fnMock = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await retry(fnMock, { ...defaultConfig, jitter: false }, () => true);

    expect(delays[0]).toBe(100);  // initialDelayMs
    expect(delays[1]).toBe(200);  // 100 * 2

    vi.restoreAllMocks();
  });

  it('应该限制最大延迟', async () => {
    const delays: number[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      delays.push(ms ?? 0);
      fn();
      return 0 as any;
    });

    const fnMock = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await retry(
      fnMock,
      { ...defaultConfig, initialDelayMs: 500, maxDelayMs: 600, maxRetries: 3 },
      () => true
    );

    // 500, min(1000, 600)=600, min(2000, 600)=600
    expect(delays[0]).toBe(500);
    expect(delays[1]).toBe(600);
    expect(delays[2]).toBe(600);

    vi.restoreAllMocks();
  });

  it('应该在启用 jitter 时添加随机抖动', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const delays: number[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      delays.push(ms ?? 0);
      fn();
      return 0 as any;
    });

    const fnMock = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await retry(
      fnMock,
      { ...defaultConfig, jitter: true },
      () => true
    );

    // With jitter: delay * (0.5 + random * 0.5) = 100 * (0.5 + 0.5*0.5) = 100 * 0.75 = 75
    expect(delays[0]).toBe(75);

    vi.restoreAllMocks();
  });
});

describe('isRetryableError', () => {
  it('应该对 5xx 状态码返回 true', () => {
    const error = { status: 500 };
    expect(isRetryableError(error)).toBe(true);
    expect(isRetryableError({ status: 502 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
  });

  it('应该对 429 状态码返回 true', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it('应该对 4xx（非429）状态码返回 false', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it('应该对网络错误返回 true', () => {
    expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('应该对普通错误返回 false', () => {
    expect(isRetryableError(new Error('validation error'))).toBe(false);
  });
});
