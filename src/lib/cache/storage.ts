/**
 * Cache Storage Implementations
 * 
 * Provides in-memory and Redis storage backends for caching.
 */

import { CacheStorage, CacheConfig } from './types';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-Memory Cache Storage
 * Suitable for single-server deployments
 */
export class InMemoryCacheStorage implements CacheStorage {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: CacheConfig = { ttlMs: 60000, maxEntries: 1000 }) {
    this.defaultTtlMs = config.ttlMs;
    this.maxEntries = config.maxEntries || 1000;
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    this.cache.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  private evictOldest(): void {
    if (this.cache.size >= this.maxEntries) {
      // Remove oldest entry (first in map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.evictOldest();
    const expiresAt = Date.now() + (ttlMs || this.defaultTtlMs);
    this.cache.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async deletePattern(pattern: string): Promise<void> {
    // Convert simple pattern to regex (supports * wildcard)
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}


/**
 * Redis Cache Storage
 * For distributed/multi-server deployments
 */
export class RedisCacheStorage implements CacheStorage {
  private redis: any;
  private readonly prefix: string;
  private readonly defaultTtlMs: number;

  constructor(redisClient: any, config: CacheConfig = { ttlMs: 60000 }) {
    this.redis = redisClient;
    this.prefix = 'chatcache:';
    this.defaultTtlMs = config.ttlMs;
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(this.key(key));
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Redis cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const ttlSeconds = Math.ceil((ttlMs || this.defaultTtlMs) / 1000);
      await this.redis.set(
        this.key(key),
        JSON.stringify(value),
        'EX',
        ttlSeconds
      );
    } catch (error) {
      console.error('Redis cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.key(key));
    } catch (error) {
      console.error('Redis cache delete error:', error);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(this.key(pattern));
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Redis cache deletePattern error:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(this.key(key));
      return exists === 1;
    } catch (error) {
      console.error('Redis cache has error:', error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Redis cache clear error:', error);
    }
  }
}
