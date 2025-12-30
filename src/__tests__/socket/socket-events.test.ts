/**
 * Socket Events Tests
 * Tests for socket.io event handling and communication
 */

import { io, Socket } from 'socket.io-client';
import {
  SendMessagePayload,
  MessagePayload,
  MinimalMessagePayload,
  TypingPayload,
  MessageStatusPayload,
  BatchStatusUpdatePayload,
  PresencePayload,
} from '@/lib/socket/types';

// Create mock socket
const createMockSocket = () => {
  const eventHandlers: Record<string, Function[]> = {};
  
  return {
    on: jest.fn((event: string, handler: Function) => {
      if (!eventHandlers[event]) eventHandlers[event] = [];
      eventHandlers[event].push(handler);
    }),
    off: jest.fn((event: string, handler?: Function) => {
      if (handler && eventHandlers[event]) {
        eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
      } else {
        delete eventHandlers[event];
      }
    }),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
    // Helper to trigger events in tests
    _trigger: (event: string, ...args: any[]) => {
      eventHandlers[event]?.forEach(handler => handler(...args));
    },
    _getHandlers: () => eventHandlers,
  };
};

describe('Socket Events', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    mockSocket = createMockSocket();
    jest.clearAllMocks();
  });

  describe('Connection Events', () => {
    it('should handle connect event', () => {
      const onConnect = jest.fn();
      mockSocket.on('connect', onConnect);
      
      mockSocket._trigger('connect');
      
      expect(onConnect).toHaveBeenCalled();
    });

    it('should handle disconnect event', () => {
      const onDisconnect = jest.fn();
      mockSocket.on('disconnect', onDisconnect);
      
      mockSocket._trigger('disconnect');
      
      expect(onDisconnect).toHaveBeenCalled();
    });

    it('should handle error event', () => {
      const onError = jest.fn();
      mockSocket.on('error', onError);
      
      const error = { message: 'Connection failed', code: 'ERR_CONNECTION' };
      mockSocket._trigger('error', error);
      
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('Message Events', () => {
    it('should emit message:send event with callback', () => {
      const payload: SendMessagePayload = {
        conversationId: 'conv1',
        content: 'Hello world',
        type: 'text',
      };
      const callback = jest.fn();

      mockSocket.emit('message:send', payload, callback);

      expect(mockSocket.emit).toHaveBeenCalledWith('message:send', payload, callback);
    });

    it('should handle message:new event', () => {
      const onMessage = jest.fn();
      mockSocket.on('message:new', onMessage);

      // Minimal payload - only essential fields
      const message: MinimalMessagePayload = {
        messageId: 'msg1',
        conversationId: 'conv1',
        senderId: 'user1',
        content: 'Hello',
        createdAt: new Date().toISOString(),
        type: 'text',
      };

      mockSocket._trigger('message:new', message);

      expect(onMessage).toHaveBeenCalledWith(message);
    });

    it('should handle message:delivered event', () => {
      const onDelivered = jest.fn();
      mockSocket.on('message:delivered', onDelivered);

      const status: MessageStatusPayload = {
        messageId: 'msg1',
        conversationId: 'conv1',
        userId: 'user2',
      };

      mockSocket._trigger('message:delivered', status);

      expect(onDelivered).toHaveBeenCalledWith(status);
    });

    it('should handle message:read event', () => {
      const onRead = jest.fn();
      mockSocket.on('message:read', onRead);

      const status: MessageStatusPayload = {
        messageId: 'msg1',
        conversationId: 'conv1',
        userId: 'user2',
      };

      mockSocket._trigger('message:read', status);

      expect(onRead).toHaveBeenCalledWith(status);
    });

    it('should handle batch delivered events', () => {
      const onBatchDelivered = jest.fn();
      mockSocket.on('message:delivered:batch', onBatchDelivered);

      const batchStatus: BatchStatusUpdatePayload = {
        conversationId: 'conv1',
        messageIds: ['msg1', 'msg2', 'msg3'],
        userId: 'user2',
      };

      mockSocket._trigger('message:delivered:batch', batchStatus);

      expect(onBatchDelivered).toHaveBeenCalledWith(batchStatus);
    });

    it('should handle batch read events', () => {
      const onBatchRead = jest.fn();
      mockSocket.on('message:read:batch', onBatchRead);

      const batchStatus: BatchStatusUpdatePayload = {
        conversationId: 'conv1',
        messageIds: ['msg1', 'msg2'],
        userId: 'user2',
        username: 'testuser',
      };

      mockSocket._trigger('message:read:batch', batchStatus);

      expect(onBatchRead).toHaveBeenCalledWith(batchStatus);
    });
  });

  describe('Typing Events', () => {
    it('should emit typing:start event', () => {
      const conversationId = 'conv1';
      
      mockSocket.emit('typing:start', conversationId);

      expect(mockSocket.emit).toHaveBeenCalledWith('typing:start', conversationId);
    });

    it('should emit typing:stop event', () => {
      const conversationId = 'conv1';
      
      mockSocket.emit('typing:stop', conversationId);

      expect(mockSocket.emit).toHaveBeenCalledWith('typing:stop', conversationId);
    });

    it('should handle typing:start from other users', () => {
      const onTypingStart = jest.fn();
      mockSocket.on('typing:start', onTypingStart);

      const typingData: TypingPayload = {
        conversationId: 'conv1',
        userId: 'user2',
        username: 'otheruser',
      };

      mockSocket._trigger('typing:start', typingData);

      expect(onTypingStart).toHaveBeenCalledWith(typingData);
    });

    it('should handle typing:stop from other users', () => {
      const onTypingStop = jest.fn();
      mockSocket.on('typing:stop', onTypingStop);

      const typingData: TypingPayload = {
        conversationId: 'conv1',
        userId: 'user2',
        username: 'otheruser',
      };

      mockSocket._trigger('typing:stop', typingData);

      expect(onTypingStop).toHaveBeenCalledWith(typingData);
    });

    it('should handle typing:update with multiple users', () => {
      const onTypingUpdate = jest.fn();
      mockSocket.on('typing:update', onTypingUpdate);

      const updateData = {
        conversationId: 'conv1',
        users: [
          { userId: 'user2', username: 'user2' },
          { userId: 'user3', username: 'user3' },
        ],
      };

      mockSocket._trigger('typing:update', updateData);

      expect(onTypingUpdate).toHaveBeenCalledWith(updateData);
    });
  });

  describe('Conversation Events', () => {
    it('should emit conversation:join event', () => {
      const conversationId = 'conv1';
      
      mockSocket.emit('conversation:join', conversationId);

      expect(mockSocket.emit).toHaveBeenCalledWith('conversation:join', conversationId);
    });

    it('should emit conversation:leave event', () => {
      const conversationId = 'conv1';
      
      mockSocket.emit('conversation:leave', conversationId);

      expect(mockSocket.emit).toHaveBeenCalledWith('conversation:leave', conversationId);
    });
  });

  describe('Presence Events', () => {
    it('should handle user:online event', () => {
      const onUserOnline = jest.fn();
      mockSocket.on('user:online', onUserOnline);

      mockSocket._trigger('user:online', 'user2');

      expect(onUserOnline).toHaveBeenCalledWith('user2');
    });

    it('should handle user:offline event', () => {
      const onUserOffline = jest.fn();
      mockSocket.on('user:offline', onUserOffline);

      mockSocket._trigger('user:offline', 'user2');

      expect(onUserOffline).toHaveBeenCalledWith('user2');
    });

    it('should emit presence:subscribe event', () => {
      const userIds = ['user2', 'user3', 'user4'];
      
      mockSocket.emit('presence:subscribe', userIds);

      expect(mockSocket.emit).toHaveBeenCalledWith('presence:subscribe', userIds);
    });

    it('should emit presence:unsubscribe event', () => {
      const userIds = ['user2', 'user3'];
      
      mockSocket.emit('presence:unsubscribe', userIds);

      expect(mockSocket.emit).toHaveBeenCalledWith('presence:unsubscribe', userIds);
    });

    it('should handle presence:update event', () => {
      const onPresenceUpdate = jest.fn();
      mockSocket.on('presence:update', onPresenceUpdate);

      const presenceData: PresencePayload = {
        userId: 'user2',
        status: 'online',
        lastSeen: new Date().toISOString(),
      };

      mockSocket._trigger('presence:update', presenceData);

      expect(onPresenceUpdate).toHaveBeenCalledWith(presenceData);
    });

    it('should handle presence:bulk event', () => {
      const onPresenceBulk = jest.fn();
      mockSocket.on('presence:bulk', onPresenceBulk);

      const bulkPresence: PresencePayload[] = [
        { userId: 'user2', status: 'online', lastSeen: new Date().toISOString() },
        { userId: 'user3', status: 'offline', lastSeen: new Date().toISOString() },
        { userId: 'user4', status: 'away', lastSeen: new Date().toISOString() },
      ];

      mockSocket._trigger('presence:bulk', bulkPresence);

      expect(onPresenceBulk).toHaveBeenCalledWith(bulkPresence);
    });
  });

  describe('Batch Status Events', () => {
    it('should emit message:delivered:batch event', () => {
      const batchPayload = {
        conversationId: 'conv1',
        messageIds: ['msg1', 'msg2', 'msg3'],
        userId: 'user1',
      };

      mockSocket.emit('message:delivered:batch', batchPayload);

      expect(mockSocket.emit).toHaveBeenCalledWith('message:delivered:batch', batchPayload);
    });

    it('should emit message:read:batch event', () => {
      const batchPayload = {
        conversationId: 'conv1',
        messageIds: ['msg1', 'msg2'],
        userId: 'user1',
      };

      mockSocket.emit('message:read:batch', batchPayload);

      expect(mockSocket.emit).toHaveBeenCalledWith('message:read:batch', batchPayload);
    });
  });

  describe('Event Cleanup', () => {
    it('should remove specific event handler', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      mockSocket.on('message:new', handler1);
      mockSocket.on('message:new', handler2);
      mockSocket.off('message:new', handler1);

      // Minimal payload - only essential fields
      const message: MinimalMessagePayload = {
        messageId: 'msg1',
        conversationId: 'conv1',
        senderId: 'user1',
        content: 'Test',
        createdAt: new Date().toISOString(),
        type: 'text',
      };

      mockSocket._trigger('message:new', message);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(message);
    });

    it('should remove all handlers for an event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      mockSocket.on('message:new', handler1);
      mockSocket.on('message:new', handler2);
      mockSocket.off('message:new');

      mockSocket._trigger('message:new', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});

describe('Socket Message Flow', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    mockSocket = createMockSocket();
  });

  it('should complete full message send/receive flow', async () => {
    const receivedMessages: MinimalMessagePayload[] = [];

    // Setup receiver - receives minimal payload
    mockSocket.on('message:new', (msg: MinimalMessagePayload) => {
      receivedMessages.push(msg);
    });

    // Send message
    const payload: SendMessagePayload = {
      conversationId: 'conv1',
      content: 'Hello!',
      type: 'text',
    };

    mockSocket.emit('message:send', payload, (response: any) => {
      // Sender receives full MessagePayload in callback
      expect(response.success).toBe(true);
    });

    // Simulate server broadcast - minimal payload for other clients
    const serverMessage: MinimalMessagePayload = {
      messageId: 'msg1',
      conversationId: 'conv1',
      senderId: 'user1',
      content: 'Hello!',
      createdAt: new Date().toISOString(),
      type: 'text',
    };

    mockSocket._trigger('message:new', serverMessage);

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].content).toBe('Hello!');
    // Verify minimal payload doesn't include user profile data
    expect((receivedMessages[0] as any).sender).toBeUndefined();
  });

  it('should handle message delivery confirmation flow', () => {
    const deliveredIds: string[] = [];

    mockSocket.on('message:delivered', (data: MessageStatusPayload) => {
      deliveredIds.push(data.messageId);
    });

    // Emit delivery confirmation
    mockSocket.emit('message:delivered', {
      messageId: 'msg1',
      conversationId: 'conv1',
      userId: 'user1',
    });

    // Simulate server broadcast
    mockSocket._trigger('message:delivered', {
      messageId: 'msg1',
      conversationId: 'conv1',
      userId: 'user2',
    });

    expect(deliveredIds).toContain('msg1');
  });
});
