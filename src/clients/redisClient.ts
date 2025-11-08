import { createClient, RedisClientType } from 'redis';
import { appConfig } from '../config';

let redisClient: RedisClientType | null = null;

export async function initRedisClient(): Promise<RedisClientType | null> {
  if (!appConfig.redisUrl) {
    console.warn('Redis URL not provided. Market data cache will use filesystem only.');
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({ url: appConfig.redisUrl });
  redisClient.on('error', err => {
    console.error('Redis client error:', err);
  });

  await redisClient.connect();
  console.log('Redis connection established');
  return redisClient;
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}
