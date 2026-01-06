/**
 * Redis Client Configuration
 * 
 * Provides Redis connection for:
 * - Caching (chat lists, user data, messages)
 * - Pub/Sub (real-time events across server instances)
 * - Session storage
 * - Rate limiting
 * 
 * Supports both single Redis and Redis Cluster.
 */

import Redis, { RedisOptions } from 'ioredis';

// Redis connection options
const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('Redis: Max retry attempts reached');
      return null; // Stop retrying
    }
    return Math.min(times * 100, 3000); // Exponential backoff, max 3s
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some(e => err.message.includes(e));
  },
  enableReadyCheck: true,
  lazyConnect: true, // Don't connect until first command
};

// Parse REDIS_URL if provided (for cloud deployments like Railway, Render)
function getRedisConfig(): RedisOptions | string {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    return redisUrl;
  }
  return redisOptions;
}

// Singleton Redis instances
let redisClient: Redis | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

/**
 * Get the main Redis client (for caching and general operations)
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    const config = getRedisConfig();
    redisClient = typeof config === 'string' ? new Redis(config) : new Redis(config);
    
    redisClient.on('connect', () => {
      console.log('✅ Redis client connected');
    });
    
    redisClient.on('error', (err) => {
      console.error('❌ Redis client error:', err.message);
    });
    
    redisClient.on('close', () => {
      console.log('🔌 Redis client disconnected');
    });
  }
  return redisClient;
}

/**
 * Get Redis publisher client (for pub/sub)
 */
export function getRedisPub(): Redis {
  if (!redisPub) {
    const config = getRedisConfig();
    redisPub = typeof config === 'string' ? new Redis(config) : new Redis(config);
    
    redisPub.on('error', (err) => {
      console.error('❌ Redis pub error:', err.message);
    });
  }
  return redisPub;
}

/**
 * Get Redis subscriber client (for pub/sub)
 */
export function getRedisSub(): Redis {
  if (!redisSub) {
    const config = getRedisConfig();
    redisSub = typeof config === 'string' ? new Redis(config) : new Redis(config);
    
    redisSub.on('error', (err) => {
      console.error('❌ Redis sub error:', err.message);
    });
  }
  return redisSub;
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect all Redis clients
 */
export async function connectRedis(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.connect();
    console.log('✅ Redis connected successfully');
    return true;
  } catch (error) {
    console.warn('⚠️ Redis not available, falling back to in-memory storage');
    return false;
  }
}

/**
 * Disconnect all Redis clients
 */
export async function disconnectRedis(): Promise<void> {
  const clients = [redisClient, redisPub, redisSub];
  await Promise.all(
    clients.map(async (client) => {
      if (client) {
        await client.quit();
      }
    })
  );
  redisClient = null;
  redisPub = null;
  redisSub = null;
}

export default getRedisClient;
