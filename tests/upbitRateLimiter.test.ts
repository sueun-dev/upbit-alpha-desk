import { describe, expect, it, vi } from 'vitest';
import { UpbitRateLimiter } from '../src/utils/upbitRateLimiter';

describe('UpbitRateLimiter', () => {
  it('enforces the minimum interval between calls', async () => {
    vi.useFakeTimers();
    const limiter = new UpbitRateLimiter({ minIntervalMs: 500, maxRetries: 0 });
    const timestamps: number[] = [];
    const start = Date.now();

    await limiter.execute(async () => {
      timestamps.push(Date.now() - start);
    });

    const secondCall = limiter.execute(async () => {
      timestamps.push(Date.now() - start);
    });

    expect(timestamps).toHaveLength(1);

    vi.advanceTimersByTime(499);
    await Promise.resolve();
    expect(timestamps).toHaveLength(1);

    vi.advanceTimersByTime(1);
    await secondCall;
    expect(timestamps[1]).toBeGreaterThanOrEqual(500);
    vi.useRealTimers();
  });

  it('retries on 429 responses before failing', async () => {
    const limiter = new UpbitRateLimiter({ minIntervalMs: 1, maxRetries: 2, retryBackoffMs: 5 });
    const fn = vi.fn().mockImplementation(() => {
      if (fn.mock.calls.length <= 1) {
        const error: any = new Error('429');
        error.response = { status: 429 };
        return Promise.reject(error);
      }
      return Promise.resolve('ok');
    });

    const result = await limiter.execute(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
