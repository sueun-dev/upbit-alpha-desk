const parseOrigins = (): string[] => {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return [];
  return raw
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
};

export const securityConfig = {
  allowedOrigins: parseOrigins(),
  apiKey: process.env.API_KEY?.trim() || null,
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS
    ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
    : 60 * 1000,
  rateLimitMax: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : 120
};

export const appConfig = {
  redisUrl: process.env.REDIS_URL || null
};
