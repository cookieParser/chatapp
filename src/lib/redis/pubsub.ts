/**
 * Redis Pub/Sub Manager
 * 
 * Handles real-time event distribution across multiple server instances.
 * Essential for horizontal scaling with multiple Socket.IO servers.
 * 
 * Channels:
 * - chat:message:{conversationId} - New messages
 * - chat:typing:{conversationId} - Typing indicators
 * - chat:presence:{userId} - User presence updates
 * - chat:notification:{userId} - Push notifications
 */

import { getRedisPub, getRedisSub } from './index';
import type Redis from 'ioredis';

// Event types for pub/sub
export interface PubSubMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  serverId: string;
}

export interface MessageEvent {
  conversationId: string;
  messageId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  createdAt: string;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}

export interface PresenceEvent {
  userId: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: string;
}

// Channel prefixes
const CHANNELS = {
  MESSAGE: 'chat:message:',
  TYPING: 'chat:typing:',
  PRESENCE: 'chat:presence:',
  NOTIFICATION: 'chat:notification:',
  BROADCAST: 'chat:broadcast',
} as const;

// Server ID for deduplication
const SERVER_ID = `server-${process.pid}-${Date.now()}`;

type MessageHandler = (channel: string, message: PubSubMessage) => void;

class PubSubManager {
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private patternHandlers: Map<string, Set<MessageHandler>> = new Map();
  private isInitialized = false;

  /**
   * Initialize pub/sub connections
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.pub = getRedisPub();
      this.sub = getRedisSub();

      // Handle incoming messages
      this.sub.on('message', (channel: string, message: string) => {
        this.handleMessage(channel, message);
      });

      this.sub.on('pmessage', (pattern: string, channel: string, message: string) => {
        this.handlePatternMessage(pattern, channel, message);
      });

      this.isInitialized = true;
      console.log('✅ Redis Pub/Sub initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Redis Pub/Sub:', error);
      throw error;
    }
  }

  private handleMessage(channel: string, message: string): void {
    try {
      const parsed: PubSubMessage = JSON.parse(message);
      
      // Skip messages from this server (deduplication)
      if (parsed.serverId === SERVER_ID) return;

      const handlers = this.handlers.get(channel);
      if (handlers) {
        handlers.forEach(handler => handler(channel, parsed));
      }
    } catch (error) {
      console.error('Error handling pub/sub message:', error);
    }
  }

  private handlePatternMessage(pattern: string, channel: string, message: string): void {
    try {
      const parsed: PubSubMessage = JSON.parse(message);
      
      if (parsed.serverId === SERVER_ID) return;

      const handlers = this.patternHandlers.get(pattern);
      if (handlers) {
        handlers.forEach(handler => handler(channel, parsed));
      }
    } catch (error) {
      console.error('Error handling pattern message:', error);
    }
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, type: string, payload: unknown): Promise<void> {
    if (!this.pub) {
      console.warn('Pub/Sub not initialized, skipping publish');
      return;
    }

    const message: PubSubMessage = {
      type,
      payload,
      timestamp: Date.now(),
      serverId: SERVER_ID,
    };

    await this.pub.publish(channel, JSON.stringify(message));
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    if (!this.sub) {
      throw new Error('Pub/Sub not initialized');
    }

    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await this.sub.subscribe(channel);
    }
    this.handlers.get(channel)!.add(handler);
  }

  /**
   * Subscribe to a pattern (e.g., 'chat:message:*')
   */
  async psubscribe(pattern: string, handler: MessageHandler): Promise<void> {
    if (!this.sub) {
      throw new Error('Pub/Sub not initialized');
    }

    if (!this.patternHandlers.has(pattern)) {
      this.patternHandlers.set(pattern, new Set());
      await this.sub.psubscribe(pattern);
    }
    this.patternHandlers.get(pattern)!.add(handler);
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    if (!this.sub) return;

    const handlers = this.handlers.get(channel);
    if (handlers) {
      if (handler) {
        handlers.delete(handler);
      }
      if (!handler || handlers.size === 0) {
        this.handlers.delete(channel);
        await this.sub.unsubscribe(channel);
      }
    }
  }

  // Convenience methods for specific event types

  /**
   * Publish a new message event
   */
  async publishMessage(event: MessageEvent): Promise<void> {
    await this.publish(
      `${CHANNELS.MESSAGE}${event.conversationId}`,
      'message:new',
      event
    );
  }

  /**
   * Publish a typing event
   */
  async publishTyping(event: TypingEvent): Promise<void> {
    await this.publish(
      `${CHANNELS.TYPING}${event.conversationId}`,
      event.isTyping ? 'typing:start' : 'typing:stop',
      event
    );
  }

  /**
   * Publish a presence update
   */
  async publishPresence(event: PresenceEvent): Promise<void> {
    await this.publish(
      `${CHANNELS.PRESENCE}${event.userId}`,
      'presence:update',
      event
    );
    // Also publish to broadcast channel for global listeners
    await this.publish(CHANNELS.BROADCAST, 'presence:update', event);
  }

  /**
   * Subscribe to messages for a conversation
   */
  async subscribeToConversation(
    conversationId: string,
    handler: (event: MessageEvent) => void
  ): Promise<void> {
    await this.subscribe(
      `${CHANNELS.MESSAGE}${conversationId}`,
      (_, msg) => handler(msg.payload as MessageEvent)
    );
  }

  /**
   * Subscribe to all message events (pattern)
   */
  async subscribeToAllMessages(
    handler: (conversationId: string, event: MessageEvent) => void
  ): Promise<void> {
    await this.psubscribe(`${CHANNELS.MESSAGE}*`, (channel, msg) => {
      const conversationId = channel.replace(CHANNELS.MESSAGE, '');
      handler(conversationId, msg.payload as MessageEvent);
    });
  }

  /**
   * Subscribe to presence updates
   */
  async subscribeToPresence(
    handler: (event: PresenceEvent) => void
  ): Promise<void> {
    await this.subscribe(CHANNELS.BROADCAST, (_, msg) => {
      if (msg.type === 'presence:update') {
        handler(msg.payload as PresenceEvent);
      }
    });
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    if (this.sub) {
      await this.sub.unsubscribe();
      await this.sub.punsubscribe();
    }
    this.handlers.clear();
    this.patternHandlers.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
export const pubSubManager = new PubSubManager();

export default pubSubManager;
