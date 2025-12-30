/**
 * Presence Management Tests
 * Tests for online/offline presence tracking
 */

import {
  InMemoryPresenceStorage,
  PresenceManager,
  getPresenceManager,
} from '@/lib/socket/presence';

describe('InMemoryPresenceStorage', () => {
  let storage: InMemoryPresenceStorage;

  beforeEach(() => {
    storage = new InMemoryPresenceStorage();
  });

  afterEach(async () => {
    await storage.cleanup();
  });

  describe('User Connections', () => {
    it('should track user connection', async () => {
      await storage.addUserConnection('user1', 'socket1');
      
      expect(await storage.isUserOnline('user1')).toBe(true);
      expect(await storage.getUserConnectionCount('user1')).toBe(1);
    });

    it('should track multiple connections for same user', async () => {
      await storage.addUserConnection('user1', 'socket1');
      await storage.addUserConnection('user1', 'socket2');
      
      expect(await storage.isUserOnline('user1')).toBe(true);
      expect(await storage.getUserConnectionCount('user1')).toBe(2);
    });

    it('should handle user disconnect', async () => {
      await storage.addUserConnection('user1', 'socket1');
      const wentOffline = await storage.removeUserConnection('user1', 'socket1');
      
      expect(wentOffline).toBe(true);
      expect(await storage.isUserOnline('user1')).toBe(false);
    });

    it('should not go offline if other connections exist', async () => {
      await storage.addUserConnection('user1', 'socket1');
      await storage.addUserConnection('user1', 'socket2');
      
      const wentOffline = await storage.removeUserConnection('user1', 'socket1');
      
      expect(wentOffline).toBe(false);
      expect(await storage.isUserOnline('user1')).toBe(true);
      expect(await storage.getUserConnectionCount('user1')).toBe(1);
    });

    it('should return false for non-existent user', async () => {
      expect(await storage.isUserOnline('nonexistent')).toBe(false);
      expect(await storage.getUserConnectionCount('nonexistent')).toBe(0);
    });
  });

  describe('Last Seen', () => {
    it('should track last seen timestamp', async () => {
      const timestamp = new Date();
      await storage.setLastSeen('user1', timestamp);
      
      const lastSeen = await storage.getLastSeen('user1');
      expect(lastSeen).toEqual(timestamp);
    });

    it('should update last seen on connection', async () => {
      await storage.addUserConnection('user1', 'socket1');
      
      const lastSeen = await storage.getLastSeen('user1');
      expect(lastSeen).toBeInstanceOf(Date);
    });

    it('should return null for unknown user', async () => {
      const lastSeen = await storage.getLastSeen('unknown');
      expect(lastSeen).toBeNull();
    });
  });

  describe('Subscriptions', () => {
    it('should track presence subscriptions', async () => {
      await storage.addSubscription('socket1', 'user2');
      await storage.addSubscription('socket1', 'user3');
      
      const subscriptions = await storage.getSubscriptionsForSocket('socket1');
      expect(subscriptions).toContain('user2');
      expect(subscriptions).toContain('user3');
    });

    it('should track subscribers for a user', async () => {
      await storage.addSubscription('socket1', 'user2');
      await storage.addSubscription('socket2', 'user2');
      
      const subscribers = await storage.getSubscribersForUser('user2');
      expect(subscribers).toContain('socket1');
      expect(subscribers).toContain('socket2');
    });

    it('should remove subscription', async () => {
      await storage.addSubscription('socket1', 'user2');
      await storage.removeSubscription('socket1', 'user2');
      
      const subscriptions = await storage.getSubscriptionsForSocket('socket1');
      expect(subscriptions).not.toContain('user2');
    });

    it('should remove all subscriptions for a socket', async () => {
      await storage.addSubscription('socket1', 'user2');
      await storage.addSubscription('socket1', 'user3');
      await storage.removeAllSubscriptions('socket1');
      
      const subscriptions = await storage.getSubscriptionsForSocket('socket1');
      expect(subscriptions).toHaveLength(0);
      
      // Should also clean up reverse index
      const subscribers = await storage.getSubscribersForUser('user2');
      expect(subscribers).not.toContain('socket1');
    });
  });

  describe('Bulk Operations', () => {
    it('should get all online users', async () => {
      await storage.addUserConnection('user1', 'socket1');
      await storage.addUserConnection('user2', 'socket2');
      await storage.addUserConnection('user3', 'socket3');
      
      const onlineUsers = await storage.getOnlineUsers();
      expect(onlineUsers).toHaveLength(3);
      expect(onlineUsers).toContain('user1');
      expect(onlineUsers).toContain('user2');
      expect(onlineUsers).toContain('user3');
    });

    it('should get presence for multiple users', async () => {
      await storage.addUserConnection('user1', 'socket1');
      // user2 is offline
      
      const presences = await storage.getPresenceForUsers(['user1', 'user2']);
      
      expect(presences).toHaveLength(2);
      expect(presences.find(p => p.userId === 'user1')?.status).toBe('online');
      expect(presences.find(p => p.userId === 'user2')?.status).toBe('offline');
    });
  });

  describe('Cleanup', () => {
    it('should clear all data on cleanup', async () => {
      await storage.addUserConnection('user1', 'socket1');
      await storage.addSubscription('socket1', 'user2');
      await storage.setLastSeen('user1', new Date());
      
      await storage.cleanup();
      
      expect(await storage.isUserOnline('user1')).toBe(false);
      expect(await storage.getSubscriptionsForSocket('socket1')).toHaveLength(0);
    });
  });
});

describe('PresenceManager', () => {
  let manager: PresenceManager;
  let mockIo: any;

  beforeEach(() => {
    manager = new PresenceManager();
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    manager.setSocketServer(mockIo);
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  describe('Connection Handling', () => {
    it('should handle user connect', async () => {
      const wasOffline = await manager.handleConnect('user1', 'socket1');
      
      expect(wasOffline).toBe(true);
      expect(await manager.isUserOnline('user1')).toBe(true);
    });

    it('should return false if user was already online', async () => {
      await manager.handleConnect('user1', 'socket1');
      const wasOffline = await manager.handleConnect('user1', 'socket2');
      
      expect(wasOffline).toBe(false);
    });

    it('should handle user disconnect', async () => {
      await manager.handleConnect('user1', 'socket1');
      const wentOffline = await manager.handleDisconnect('user1', 'socket1');
      
      expect(wentOffline).toBe(true);
      expect(await manager.isUserOnline('user1')).toBe(false);
    });
  });

  describe('Presence Queries', () => {
    it('should get presence for a user', async () => {
      await manager.handleConnect('user1', 'socket1');
      
      const presence = await manager.getPresence('user1');
      
      expect(presence.userId).toBe('user1');
      expect(presence.status).toBe('online');
      expect(presence.lastSeen).toBeDefined();
    });

    it('should get presence for multiple users', async () => {
      await manager.handleConnect('user1', 'socket1');
      
      const presences = await manager.getPresenceForUsers(['user1', 'user2']);
      
      expect(presences).toHaveLength(2);
      expect(presences.find(p => p.userId === 'user1')?.status).toBe('online');
      expect(presences.find(p => p.userId === 'user2')?.status).toBe('offline');
    });

    it('should get online users list', async () => {
      await manager.handleConnect('user1', 'socket1');
      await manager.handleConnect('user2', 'socket2');
      
      const onlineUsers = await manager.getOnlineUsers();
      
      expect(onlineUsers).toContain('user1');
      expect(onlineUsers).toContain('user2');
    });

    it('should get last seen timestamp', async () => {
      await manager.handleConnect('user1', 'socket1');
      
      const lastSeen = await manager.getLastSeen('user1');
      
      expect(lastSeen).toBeInstanceOf(Date);
    });
  });

  describe('Subscriptions', () => {
    it('should subscribe to presence updates', async () => {
      await manager.handleConnect('user2', 'socket2');
      
      const presences = await manager.subscribe('socket1', ['user2']);
      
      expect(presences).toHaveLength(1);
      expect(presences[0].userId).toBe('user2');
      expect(presences[0].status).toBe('online');
    });

    it('should unsubscribe from presence updates', async () => {
      await manager.subscribe('socket1', ['user2']);
      await manager.unsubscribe('socket1', ['user2']);
      
      // No error should be thrown
    });
  });

  describe('Broadcasts', () => {
    it('should broadcast online status to subscribers', async () => {
      // Subscribe socket1 to user2's presence
      await manager.subscribe('socket1', ['user2']);
      
      // User2 comes online
      await manager.handleConnect('user2', 'socket2');
      
      // Wait for debounced broadcast
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should emit to subscribers and globally
      expect(mockIo.emit).toHaveBeenCalledWith('user:online', 'user2');
    });

    it('should broadcast offline status to subscribers', async () => {
      // User2 is online
      await manager.handleConnect('user2', 'socket2');
      
      // Subscribe socket1 to user2's presence
      await manager.subscribe('socket1', ['user2']);
      
      // Clear previous calls
      mockIo.emit.mockClear();
      
      // User2 goes offline
      await manager.handleDisconnect('user2', 'socket2');
      
      // Wait for debounced broadcast
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(mockIo.emit).toHaveBeenCalledWith('user:offline', 'user2');
    });
  });
});

describe('getPresenceManager', () => {
  it('should return singleton instance', () => {
    const manager1 = getPresenceManager();
    const manager2 = getPresenceManager();
    
    expect(manager1).toBe(manager2);
  });
});
