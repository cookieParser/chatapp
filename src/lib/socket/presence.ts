/**
 * Presence Management System
 * 
 * Handles online/offline presence tracking using Socket.IO.
 * Supports both in-memory storage (default) and Redis (for distributed systems).
 * 
 * Features:
 * - Track user online/offline status
 * - Support multiple connections per user (tabs/devices)
 * - Efficient presence broadcasts to subscribers only
 * - Last seen timestamps
 * - Configurable storage backend (memory/Redis)
 */

import { Server as SocketServer, Socket } from 'socket.io';
import { UserStatus, PresencePayload } from './types';

// Presence storage interface for swappable backends
export interface PresenceStorage {
  // User connection tracking
  addUserConnection(userId: string, socketId: string): Promise<void>;
  removeUserConnection(userId: string, socketId: string): Promise<boolean>; // returns true if user went offline
  getUserConnectionCount(userId: string): Promise<number>;
  isUserOnline(userId: string): Promise<boolean>;
  
  // Last seen tracking
  setLastSeen(userId: string, timestamp: Date): Promise<void>;
  getLastSeen(userId: string): Promise<Date | null>;
  
  // Presence subscriptions
  addSubscription(socketId: string, userId: string): Promise<void>;
  removeSubscription(socketId: string, userId: string): Promise<void>;
  removeAllSubscriptions(socketId: string): Promise<void>;
  getSubscribersForUser(userId: string): Promise<string[]>;
  getSubscriptionsForSocket(socketId: string): Promise<string[]>;
  
  // Bulk operations
  getOnlineUsers(): Promise<string[]>;
  getPresenceForUsers(userIds: string[]): Promise<PresencePayload[]>;
  
  // Cleanup
  cleanup(): Promise<void>;
}

/**
 * In-Memory Presence Storage
 * Suitable for single-server deployments
 */
export class InMemoryPresenceStorage implements PresenceStorage {
  // Map<userId, Set<socketId>>
  private userConnections = new Map<string, Set<string>>();
  // Map<userId, Date>
  private lastSeenMap = new Map<string, Date>();
  // Map<socketId, Set<userId>> - which users each socket is subscribed to
  private subscriptions = new Map<string, Set<string>>();
  // Map<userId, Set<socketId>> - reverse index for efficient broadcast
  private subscriberIndex = new Map<string, Set<string>>();

  async addUserConnection(userId: string, socketId: string): Promise<void> {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socketId);
    this.lastSeenMap.set(userId, new Date());
  }

  async removeUserConnection(userId: string, socketId: string): Promise<boolean> {
    const connections = this.userConnections.get(userId);
    if (connections) {
      connections.delete(socketId);
      if (connections.size === 0) {
        this.userConnections.delete(userId);
        this.lastSeenMap.set(userId, new Date());
        return true; // User went offline
      }
    }
    return false;
  }

  async getUserConnectionCount(userId: string): Promise<number> {
    return this.userConnections.get(userId)?.size || 0;
  }

  async isUserOnline(userId: string): Promise<boolean> {
    return this.userConnections.has(userId) && this.userConnections.get(userId)!.size > 0;
  }

  async setLastSeen(userId: string, timestamp: Date): Promise<void> {
    this.lastSeenMap.set(userId, timestamp);
  }

  async getLastSeen(userId: string): Promise<Date | null> {
    return this.lastSeenMap.get(userId) || null;
  }

  async addSubscription(socketId: string, userId: string): Promise<void> {
    // Add to socket's subscriptions
    if (!this.subscriptions.has(socketId)) {
      this.subscriptions.set(socketId, new Set());
    }
    this.subscriptions.get(socketId)!.add(userId);

    // Add to reverse index
    if (!this.subscriberIndex.has(userId)) {
      this.subscriberIndex.set(userId, new Set());
    }
    this.subscriberIndex.get(userId)!.add(socketId);
  }

  async removeSubscription(socketId: string, userId: string): Promise<void> {
    this.subscriptions.get(socketId)?.delete(userId);
    this.subscriberIndex.get(userId)?.delete(socketId);
  }

  async removeAllSubscriptions(socketId: string): Promise<void> {
    const userIds = this.subscriptions.get(socketId);
    if (userIds) {
      userIds.forEach(userId => {
        this.subscriberIndex.get(userId)?.delete(socketId);
      });
      this.subscriptions.delete(socketId);
    }
  }

  async getSubscribersForUser(userId: string): Promise<string[]> {
    return Array.from(this.subscriberIndex.get(userId) || []);
  }

  async getSubscriptionsForSocket(socketId: string): Promise<string[]> {
    return Array.from(this.subscriptions.get(socketId) || []);
  }

  async getOnlineUsers(): Promise<string[]> {
    return Array.from(this.userConnections.keys());
  }

  async getPresenceForUsers(userIds: string[]): Promise<PresencePayload[]> {
    return userIds.map(userId => ({
      userId,
      status: this.userConnections.has(userId) ? 'online' : 'offline' as UserStatus,
      lastSeen: this.lastSeenMap.get(userId)?.toISOString() || null,
    }));
  }

  async cleanup(): Promise<void> {
    this.userConnections.clear();
    this.lastSeenMap.clear();
    this.subscriptions.clear();
    this.subscriberIndex.clear();
  }
}

/**
 * Redis Presence Storage
 * For distributed/multi-server deployments
 */
export class RedisPresenceStorage implements PresenceStorage {
  private redis: any; // Redis client instance
  private readonly prefix = 'presence:';
  private readonly connectionsTTL = 86400; // 24 hours

  constructor(redisClient: any) {
    this.redis = redisClient;
  }

  private key(type: string, id: string): string {
    return `${this.prefix}${type}:${id}`;
  }

  async addUserConnection(userId: string, socketId: string): Promise<void> {
    const key = this.key('connections', userId);
    await this.redis.sadd(key, socketId);
    await this.redis.expire(key, this.connectionsTTL);
    await this.setLastSeen(userId, new Date());
  }

  async removeUserConnection(userId: string, socketId: string): Promise<boolean> {
    const key = this.key('connections', userId);
    await this.redis.srem(key, socketId);
    const count = await this.redis.scard(key);
    if (count === 0) {
      await this.setLastSeen(userId, new Date());
      return true;
    }
    return false;
  }

  async getUserConnectionCount(userId: string): Promise<number> {
    return await this.redis.scard(this.key('connections', userId));
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const count = await this.redis.scard(this.key('connections', userId));
    return count > 0;
  }

  async setLastSeen(userId: string, timestamp: Date): Promise<void> {
    await this.redis.set(
      this.key('lastseen', userId),
      timestamp.toISOString(),
      'EX',
      this.connectionsTTL
    );
  }

  async getLastSeen(userId: string): Promise<Date | null> {
    const value = await this.redis.get(this.key('lastseen', userId));
    return value ? new Date(value) : null;
  }

  async addSubscription(socketId: string, userId: string): Promise<void> {
    await this.redis.sadd(this.key('subs', socketId), userId);
    await this.redis.sadd(this.key('subscribers', userId), socketId);
    await this.redis.expire(this.key('subs', socketId), this.connectionsTTL);
    await this.redis.expire(this.key('subscribers', userId), this.connectionsTTL);
  }

  async removeSubscription(socketId: string, userId: string): Promise<void> {
    await this.redis.srem(this.key('subs', socketId), userId);
    await this.redis.srem(this.key('subscribers', userId), socketId);
  }

  async removeAllSubscriptions(socketId: string): Promise<void> {
    const userIds = await this.redis.smembers(this.key('subs', socketId));
    for (const userId of userIds) {
      await this.redis.srem(this.key('subscribers', userId), socketId);
    }
    await this.redis.del(this.key('subs', socketId));
  }

  async getSubscribersForUser(userId: string): Promise<string[]> {
    return await this.redis.smembers(this.key('subscribers', userId));
  }

  async getSubscriptionsForSocket(socketId: string): Promise<string[]> {
    return await this.redis.smembers(this.key('subs', socketId));
  }

  async getOnlineUsers(): Promise<string[]> {
    const keys = await this.redis.keys(`${this.prefix}connections:*`);
    const userIds: string[] = [];
    for (const key of keys) {
      const count = await this.redis.scard(key);
      if (count > 0) {
        userIds.push(key.replace(`${this.prefix}connections:`, ''));
      }
    }
    return userIds;
  }

  async getPresenceForUsers(userIds: string[]): Promise<PresencePayload[]> {
    const results: PresencePayload[] = [];
    for (const userId of userIds) {
      const isOnline = await this.isUserOnline(userId);
      const lastSeen = await this.getLastSeen(userId);
      results.push({
        userId,
        status: isOnline ? 'online' : 'offline',
        lastSeen: lastSeen?.toISOString() || null,
      });
    }
    return results;
  }

  async cleanup(): Promise<void> {
    const keys = await this.redis.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

/**
 * Presence Manager
 * Coordinates presence tracking and broadcasts
 */
export class PresenceManager {
  private storage: PresenceStorage;
  private io: SocketServer | null = null;
  private broadcastDebounce = new Map<string, NodeJS.Timeout>();
  private readonly BROADCAST_DEBOUNCE_MS = 100;

  constructor(storage?: PresenceStorage) {
    this.storage = storage || new InMemoryPresenceStorage();
  }

  setSocketServer(io: SocketServer): void {
    this.io = io;
  }

  setStorage(storage: PresenceStorage): void {
    this.storage = storage;
  }

  /**
   * Handle user connection
   */
  async handleConnect(userId: string, socketId: string): Promise<boolean> {
    const wasOffline = !(await this.storage.isUserOnline(userId));
    await this.storage.addUserConnection(userId, socketId);
    
    if (wasOffline) {
      await this.broadcastPresenceUpdate(userId, 'online');
    }
    
    return wasOffline;
  }

  /**
   * Handle user disconnection
   */
  async handleDisconnect(userId: string, socketId: string): Promise<boolean> {
    // Clean up subscriptions for this socket
    await this.storage.removeAllSubscriptions(socketId);
    
    const wentOffline = await this.storage.removeUserConnection(userId, socketId);
    
    if (wentOffline) {
      await this.broadcastPresenceUpdate(userId, 'offline');
    }
    
    return wentOffline;
  }

  /**
   * Subscribe a socket to presence updates for specific users
   */
  async subscribe(socketId: string, userIds: string[]): Promise<PresencePayload[]> {
    for (const userId of userIds) {
      await this.storage.addSubscription(socketId, userId);
    }
    return this.storage.getPresenceForUsers(userIds);
  }

  /**
   * Unsubscribe a socket from presence updates
   */
  async unsubscribe(socketId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await this.storage.removeSubscription(socketId, userId);
    }
  }

  /**
   * Get presence for a single user
   */
  async getPresence(userId: string): Promise<PresencePayload> {
    const isOnline = await this.storage.isUserOnline(userId);
    const lastSeen = await this.storage.getLastSeen(userId);
    return {
      userId,
      status: isOnline ? 'online' : 'offline',
      lastSeen: (lastSeen || new Date()).toISOString(),
    };
  }

  /**
   * Get presence for multiple users
   */
  async getPresenceForUsers(userIds: string[]): Promise<PresencePayload[]> {
    return this.storage.getPresenceForUsers(userIds);
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    return this.storage.isUserOnline(userId);
  }

  /**
   * Get all online users
   */
  async getOnlineUsers(): Promise<string[]> {
    return this.storage.getOnlineUsers();
  }

  /**
   * Get user's last seen timestamp
   */
  async getLastSeen(userId: string): Promise<Date | null> {
    return this.storage.getLastSeen(userId);
  }

  /**
   * Broadcast presence update to subscribers (debounced)
   */
  private async broadcastPresenceUpdate(userId: string, status: UserStatus): Promise<void> {
    if (!this.io) return;

    // Debounce rapid status changes
    const existingTimeout = this.broadcastDebounce.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      this.broadcastDebounce.delete(userId);
      await this.doBroadcast(userId, status);
    }, this.BROADCAST_DEBOUNCE_MS);

    this.broadcastDebounce.set(userId, timeout);
  }

  private async doBroadcast(userId: string, status: UserStatus): Promise<void> {
    if (!this.io) return;

    const lastSeen = await this.storage.getLastSeen(userId);
    const presence: PresencePayload = {
      userId,
      status,
      lastSeen: (lastSeen || new Date()).toISOString(),
    };

    // Get all sockets subscribed to this user's presence
    const subscriberSocketIds = await this.storage.getSubscribersForUser(userId);
    
    // Send targeted updates to subscribers
    for (const socketId of subscriberSocketIds) {
      this.io.to(socketId).emit('presence:update', presence);
    }

    // Also emit global online/offline events
    if (status === 'online') {
      this.io.emit('user:online', userId);
    } else {
      this.io.emit('user:offline', userId);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.broadcastDebounce.forEach(timeout => clearTimeout(timeout));
    this.broadcastDebounce.clear();
    await this.storage.cleanup();
  }
}

// Singleton instance
let presenceManager: PresenceManager | null = null;

/**
 * Get or create the presence manager instance
 */
export function getPresenceManager(storage?: PresenceStorage): PresenceManager {
  if (!presenceManager) {
    presenceManager = new PresenceManager(storage);
  } else if (storage) {
    presenceManager.setStorage(storage);
  }
  return presenceManager;
}

/**
 * Create a Redis-backed presence manager
 * Call this during server initialization if using Redis
 */
export function createRedisPresenceManager(redisClient: any): PresenceManager {
  const storage = new RedisPresenceStorage(redisClient);
  return getPresenceManager(storage);
}
