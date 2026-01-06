/**
 * Redis Cache Service
 * 
 * High-performance caching layer with:
 * - Automatic serialization/deserialization
 * - TTL management
 * - Cache invalidation patterns
 * - Fallback to in-memory when Redis unavailable
 */

import { getRedisClient, isRedisAvailable } from './index';
import type Redis from 'ioredis';

// Cache key prefixes
export const CACHE_KEYS = {
  USER: 'cache:user:',
  CHAT_LIST: 'cache:chatlist:',
  CONVERSATION: 'cache:conv:',
  MESSAGES: 'cache:messages:',
  PRESENCE: 'cache:presence:',
  UNREAD: 'cache:unread:',
  SESSION: 'cache:session:',
} as const;

// Default TTLs (in seconds)
export const CACHE_TTL = {
  USER: 3600,           // 1 hour
  CHAT_LIST: 300,       // 5 minutes
  CONVERSATION: 1800,   // 30 minutes
  MESSAGES: 600,        // 10 minutes
  PRESENCE: 60,         // 1 minute
  UNREAD: 300,          // 5 minutes
  SESSION: 86400,       // 24 hours
} as const;

// In-memory fallback cache
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

class CacheService {
  private redis: Redis | null = null;
  private useMemoryFallback = false;

  /**
   * Initialize cache service
   */
  async initialize(): Promise<void> {
    const available = await isRedisAvailable();
    if (available) {
      this.redis = getRedisClient();
      this.useMemoryFallback = false;
      console.log('✅ Cache service using Redis');
    } else {
      this.useMemoryFallback = true;
      console.log('⚠️ Cache service using in-memory fallback');
    }
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.useMemoryFallback) {
        return this.memoryGet<T>(key);
      }

      const value = await this.redis!.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      
      if (this.useMemoryFallback) {
        this.memorySet(key, serialized, ttlSeconds);
        return;
      }

      if (ttlSeconds) {
        await this.redis!.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis!.set(key, serialized);
      }
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string): Promise<void> {
    try {
      if (this.useMemoryFallback) {
        memoryCache.delete(key);
        return;
      }
      await this.redis!.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Delete keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      if (this.useMemoryFallback) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (const key of memoryCache.keys()) {
          if (regex.test(key)) {
            memoryCache.delete(key);
          }
        }
        return;
      }

      const keys = await this.redis!.keys(pattern);
      if (keys.length > 0) {
        await this.redis!.del(...keys);
      }
    } catch (error) {
      console.error('Cache deletePattern error:', error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (this.useMemoryFallback) {
        const entry = memoryCache.get(key);
        if (!entry) return false;
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
          memoryCache.delete(key);
          return false;
        }
        return true;
      }
      return (await this.redis!.exists(key)) === 1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    try {
      if (this.useMemoryFallback) {
        const current = await this.get<number>(key) || 0;
        await this.set(key, current + 1);
        return current + 1;
      }
      return await this.redis!.incr(key);
    } catch (error) {
      console.error('Cache incr error:', error);
      return 0;
    }
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      if (this.useMemoryFallback) {
        const entry = memoryCache.get(key);
        if (entry) {
          entry.expiresAt = Date.now() + ttlSeconds * 1000;
        }
        return;
      }
      await this.redis!.expire(key, ttlSeconds);
    } catch (error) {
      console.error('Cache expire error:', error);
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (this.useMemoryFallback) {
        return keys.map(key => this.memoryGet<T>(key));
      }

      const values = await this.redis!.mget(...keys);
      return values.map(v => (v ? JSON.parse(v) as T : null));
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> {
    try {
      if (this.useMemoryFallback) {
        entries.forEach(({ key, value, ttl }) => {
          this.memorySet(key, JSON.stringify(value), ttl);
        });
        return;
      }

      const pipeline = this.redis!.pipeline();
      entries.forEach(({ key, value, ttl }) => {
        const serialized = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      });
      await pipeline.exec();
    } catch (error) {
      console.error('Cache mset error:', error);
    }
  }

  // Memory fallback helpers
  private memoryGet<T>(key: string): T | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      memoryCache.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  private memorySet(key: string, value: string, ttlSeconds?: number): void {
    memoryCache.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
    });
  }

  // Convenience methods for specific cache types

  /**
   * Cache user data
   */
  async cacheUser(userId: string, userData: unknown): Promise<void> {
    await this.set(`${CACHE_KEYS.USER}${userId}`, userData, CACHE_TTL.USER);
  }

  /**
   * Get cached user data
   */
  async getCachedUser<T>(userId: string): Promise<T | null> {
    return this.get<T>(`${CACHE_KEYS.USER}${userId}`);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUser(userId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.USER}${userId}`);
  }

  /**
   * Cache chat list for a user
   */
  async cacheChatList(userId: string, chatList: unknown): Promise<void> {
    await this.set(`${CACHE_KEYS.CHAT_LIST}${userId}`, chatList, CACHE_TTL.CHAT_LIST);
  }

  /**
   * Get cached chat list
   */
  async getCachedChatList<T>(userId: string): Promise<T | null> {
    return this.get<T>(`${CACHE_KEYS.CHAT_LIST}${userId}`);
  }

  /**
   * Invalidate chat list cache
   */
  async invalidateChatList(userId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.CHAT_LIST}${userId}`);
  }

  /**
   * Invalidate chat lists for multiple users
   */
  async invalidateChatListsForUsers(userIds: string[]): Promise<void> {
    const keys = userIds.map(id => `${CACHE_KEYS.CHAT_LIST}${id}`);
    if (this.useMemoryFallback) {
      keys.forEach(key => memoryCache.delete(key));
      return;
    }
    if (keys.length > 0) {
      await this.redis!.del(...keys);
    }
  }

  /**
   * Get/set unread count
   */
  async getUnreadCount(userId: string, conversationId: string): Promise<number> {
    const count = await this.get<number>(`${CACHE_KEYS.UNREAD}${userId}:${conversationId}`);
    return count || 0;
  }

  async setUnreadCount(userId: string, conversationId: string, count: number): Promise<void> {
    await this.set(`${CACHE_KEYS.UNREAD}${userId}:${conversationId}`, count, CACHE_TTL.UNREAD);
  }

  async incrementUnreadCount(userId: string, conversationId: string): Promise<number> {
    const key = `${CACHE_KEYS.UNREAD}${userId}:${conversationId}`;
    if (this.useMemoryFallback) {
      const current = await this.getUnreadCount(userId, conversationId);
      await this.setUnreadCount(userId, conversationId, current + 1);
      return current + 1;
    }
    const count = await this.redis!.incr(key);
    await this.expire(key, CACHE_TTL.UNREAD);
    return count;
  }

  async resetUnreadCount(userId: string, conversationId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.UNREAD}${userId}:${conversationId}`);
  }
}

// Singleton instance
export const cacheService = new CacheService();

export default cacheService;
