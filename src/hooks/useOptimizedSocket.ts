/**
 * Optimized Socket.IO Hook
 * 
 * WhatsApp-like socket behavior:
 * - Connect only when app is visible (foreground)
 * - Silent reconnection with exponential backoff
 * - Used only for typing, presence, and read receipts
 * - Messages delivered via push notifications when in background
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_THROTTLE } from '@/lib/constants';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  TypingPayload,
  PresencePayload,
  MinimalMessagePayload,
} from '@/lib/socket/types';
import { usePresenceStore } from '@/store/presenceStore';

type SocketClient = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseOptimizedSocketOptions {
  userId: string;
  username: string;
  enabled?: boolean;
  onMessage?: (message: MinimalMessagePayload) => void;
  onTypingStart?: (data: TypingPayload) => void;
  onTypingStop?: (data: TypingPayload) => void;
  onMessageDeleted?: (data: { messageId: string; conversationId: string }) => void;
}

// Connection states for UI feedback
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// Exponential backoff configuration
const BACKOFF_CONFIG = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 1.5,
  jitter: 0.3,
};

export function useOptimizedSocket(options: UseOptimizedSocketOptions) {
  const {
    userId,
    username,
    enabled = true,
    onMessage,
    onTypingStart,
    onTypingStop,
    onMessageDeleted,
  } = options;

  const socketRef = useRef<SocketClient | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isVisible, setIsVisible] = useState(true);
  
  // Reconnection state
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Typing state
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const isTypingRef = useRef<Map<string, boolean>>(new Map());
  
  // Batch receipt queues
  const deliveredQueueRef = useRef<Map<string, Set<string>>>(new Map());
  const readQueueRef = useRef<Map<string, Set<string>>>(new Map());
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Presence store
  const { setPresence, setPresenceBulk } = usePresenceStore();

  /**
   * Calculate backoff delay with jitter
   */
  const getBackoffDelay = useCallback(() => {
    const { initialDelay, maxDelay, multiplier, jitter } = BACKOFF_CONFIG;
    const delay = Math.min(
      initialDelay * Math.pow(multiplier, reconnectAttemptRef.current),
      maxDelay
    );
    const jitterAmount = delay * jitter * (Math.random() * 2 - 1);
    return Math.round(delay + jitterAmount);
  }, []);

  /**
   * Flush batched receipts
   */
  const flushReceipts = useCallback(() => {
    if (!socketRef.current?.connected) return;

    deliveredQueueRef.current.forEach((messageIds, conversationId) => {
      if (messageIds.size > 0) {
        socketRef.current?.emit('message:delivered:batch', {
          conversationId,
          messageIds: Array.from(messageIds),
          userId,
        });
        messageIds.clear();
      }
    });

    readQueueRef.current.forEach((messageIds, conversationId) => {
      if (messageIds.size > 0) {
        socketRef.current?.emit('message:read:batch', {
          conversationId,
          messageIds: Array.from(messageIds),
          userId,
        });
        messageIds.clear();
      }
    });

    flushTimeoutRef.current = null;
  }, [userId]);

  const scheduleFlush = useCallback(() => {
    if (!flushTimeoutRef.current) {
      flushTimeoutRef.current = setTimeout(flushReceipts, SOCKET_THROTTLE.BATCH_RECEIPTS_MS);
    }
  }, [flushReceipts]);

  /**
   * Connect socket
   */
  const connect = useCallback(() => {
    if (!userId || !username || !enabled) return;
    if (socketRef.current?.connected) return;

    setConnectionState('connecting');

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

    const socket: SocketClient = io(socketUrl, {
      auth: { userId, username },
      transports: ['websocket', 'polling'],
      reconnection: false, // We handle reconnection manually
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected');
      setConnectionState('connected');
      reconnectAttemptRef.current = 0;
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setConnectionState('disconnected');

      // Auto-reconnect if still visible and not intentional disconnect
      if (isVisible && reason !== 'io client disconnect') {
        scheduleReconnect();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setConnectionState('disconnected');
      
      if (isVisible) {
        scheduleReconnect();
      }
    });

    // Message events (backup to push notifications)
    socket.on('message:new', (message) => {
      onMessage?.(message);
    });

    socket.on('message:deleted', (data) => {
      onMessageDeleted?.(data);
    });

    // Typing events
    socket.on('typing:start', (data) => {
      onTypingStart?.(data);
    });

    socket.on('typing:stop', (data) => {
      onTypingStop?.(data);
    });

    // Presence events
    socket.on('user:online', (id) => {
      setPresence(id, 'online', new Date());
    });

    socket.on('user:offline', (id) => {
      setPresence(id, 'offline', new Date());
    });

    socket.on('presence:update', (data: PresencePayload) => {
      setPresence(data.userId, data.status, data.lastSeen ? new Date(data.lastSeen) : null);
    });

    socket.on('presence:bulk', (data: PresencePayload[]) => {
      setPresenceBulk(data.map(d => ({
        userId: d.userId,
        status: d.status,
        lastSeen: d.lastSeen ? new Date(d.lastSeen) : null,
      })));
    });

    // Read receipt events
    socket.on('message:delivered:batch', (data) => {
      // Handle batch delivery confirmations
    });

    socket.on('message:read:batch', (data) => {
      // Handle batch read confirmations
    });
  }, [userId, username, enabled, isVisible, onMessage, onTypingStart, onTypingStop, onMessageDeleted, setPresence, setPresenceBulk]);

  /**
   * Disconnect socket
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionState('disconnected');
  }, []);

  /**
   * Schedule reconnection with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) return;

    const delay = getBackoffDelay();
    reconnectAttemptRef.current++;

    console.log(`[Socket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);
    setConnectionState('reconnecting');

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connect();
    }, delay);
  }, [connect, getBackoffDelay]);

  /**
   * Handle visibility change
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);

      if (visible) {
        // App came to foreground - connect
        if (!socketRef.current?.connected) {
          reconnectAttemptRef.current = 0; // Reset backoff
          connect();
        }
      } else {
        // App went to background - disconnect after delay
        // Keep connection briefly for any pending operations
        setTimeout(() => {
          if (document.visibilityState !== 'visible') {
            console.log('[Socket] Disconnecting (app in background)');
            disconnect();
          }
        }, 5000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initial connection if visible
    if (document.visibilityState === 'visible') {
      connect();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      disconnect();
    };
  }, [connect, disconnect]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      typingTimeoutRef.current.forEach(clearTimeout);
      typingTimeoutRef.current.clear();
      
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushReceipts();
      }
    };
  }, [flushReceipts]);

  // ============================================
  // PUBLIC API
  // ============================================

  const joinConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('conversation:join', conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    // Flush receipts before leaving
    flushReceipts();
    socketRef.current?.emit('conversation:leave', conversationId);
  }, [flushReceipts]);

  const sendMessage = useCallback(
    (data: { conversationId: string; content: string; type?: 'text' | 'image' | 'file'; replyToId?: string }) => {
      return new Promise<{ success: boolean; message?: any; error?: string }>((resolve) => {
        if (!socketRef.current?.connected) {
          resolve({ success: false, error: 'Not connected' });
          return;
        }

        // Stop typing when sending
        if (isTypingRef.current.get(data.conversationId)) {
          socketRef.current?.emit('typing:stop', data.conversationId);
          isTypingRef.current.set(data.conversationId, false);
        }

        socketRef.current.emit('message:send', data, resolve);
      });
    },
    []
  );

  const startTyping = useCallback((conversationId: string) => {
    const existingTimeout = typingTimeoutRef.current.get(conversationId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    if (!isTypingRef.current.get(conversationId)) {
      isTypingRef.current.set(conversationId, true);
      socketRef.current?.emit('typing:start', conversationId);
    }

    const timeout = setTimeout(() => {
      if (isTypingRef.current.get(conversationId)) {
        socketRef.current?.emit('typing:stop', conversationId);
        isTypingRef.current.set(conversationId, false);
      }
      typingTimeoutRef.current.delete(conversationId);
    }, SOCKET_THROTTLE.TYPING_TIMEOUT_MS);

    typingTimeoutRef.current.set(conversationId, timeout);
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    const existingTimeout = typingTimeoutRef.current.get(conversationId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      typingTimeoutRef.current.delete(conversationId);
    }

    if (isTypingRef.current.get(conversationId)) {
      socketRef.current?.emit('typing:stop', conversationId);
      isTypingRef.current.set(conversationId, false);
    }
  }, []);

  const markDelivered = useCallback((messageId: string, conversationId: string) => {
    if (!deliveredQueueRef.current.has(conversationId)) {
      deliveredQueueRef.current.set(conversationId, new Set());
    }
    deliveredQueueRef.current.get(conversationId)!.add(messageId);
    scheduleFlush();
  }, [scheduleFlush]);

  const markRead = useCallback((messageId: string, conversationId: string) => {
    if (!readQueueRef.current.has(conversationId)) {
      readQueueRef.current.set(conversationId, new Set());
    }
    readQueueRef.current.get(conversationId)!.add(messageId);
    scheduleFlush();
  }, [scheduleFlush]);

  const markReadBatch = useCallback((messageIds: string[], conversationId: string) => {
    if (!readQueueRef.current.has(conversationId)) {
      readQueueRef.current.set(conversationId, new Set());
    }
    const queue = readQueueRef.current.get(conversationId)!;
    messageIds.forEach(id => queue.add(id));
    scheduleFlush();
  }, [scheduleFlush]);

  const subscribeToPresence = useCallback((userIds: string[]) => {
    if (socketRef.current?.connected && userIds.length > 0) {
      socketRef.current.emit('presence:subscribe', userIds);
    }
  }, []);

  const unsubscribeFromPresence = useCallback((userIds: string[]) => {
    if (socketRef.current?.connected && userIds.length > 0) {
      socketRef.current.emit('presence:unsubscribe', userIds);
    }
  }, []);

  return {
    // Connection state
    connectionState,
    isConnected: connectionState === 'connected',
    isReconnecting: connectionState === 'reconnecting',
    
    // Connection control
    connect,
    disconnect,
    
    // Conversation management
    joinConversation,
    leaveConversation,
    
    // Messaging
    sendMessage,
    
    // Typing indicators
    startTyping,
    stopTyping,
    
    // Read receipts
    markDelivered,
    markRead,
    markReadBatch,
    
    // Presence
    subscribeToPresence,
    unsubscribeFromPresence,
  };
}
