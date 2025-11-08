type RateLimiterOptions = {
  minIntervalMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
};

const DEFAULT_OPTIONS: Required<RateLimiterOptions> = {
  minIntervalMs: 350,
  maxRetries: 3,
  retryBackoffMs: 800
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class UpbitRateLimiter {
  private lastCallTimestamp = 0;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;

  constructor(options?: RateLimiterOptions) {
    this.minIntervalMs = options?.minIntervalMs ?? DEFAULT_OPTIONS.minIntervalMs;
    this.maxRetries = options?.maxRetries ?? DEFAULT_OPTIONS.maxRetries;
    this.retryBackoffMs = options?.retryBackoffMs ?? DEFAULT_OPTIONS.retryBackoffMs;
  }

  private async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastCallTimestamp;
    if (this.lastCallTimestamp && elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastCallTimestamp = Date.now();
  }

  private isRetryable(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { response?: { status?: number } };
    const status = candidate.response?.status ?? (error as any).status;
    return status === 429;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      await this.throttle();
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        if (!this.isRetryable(error) || attempt > this.maxRetries) {
          throw error;
        }
        const backoff = this.retryBackoffMs * attempt;
        await sleep(backoff);
      }
    }
  }
}

const defaultLimiter = new UpbitRateLimiter();

export async function runWithUpbitRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  return defaultLimiter.execute(fn);
}

export { sleep };
