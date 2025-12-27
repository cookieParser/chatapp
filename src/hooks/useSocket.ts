'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_THROTTLE } from '@/lib/constants';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SendMessagePayload,
  MessagePayload,
  MessageResponse,
  TypingPayload,
  TypingUpdatePayload,
  BatchStatusUpdatePayload,
  PresencePayload,
} from '@/lib/socket/types';
import { setPresenceSocket } from './usePresence';
import { usePresenceStore } from '@/store/presenceStore';

type SocketClient = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseSocketOptions {
  userId: string;
  username: string;
  onMessage?: (message: MessagePayload) => void;
  onTypingStart?: (data: TypingPayload) => void;
  onTypingStop?: (data: TypingPayload) => void;
  onTypingUpdate?: (data: TypingUpdatePayload) => void;
  onUserOnline?: (userId: string) => void;
  onUserOffline?: (userId: string) => void;
  onMessageDelivered?: (data: { messageId: string; userId: string }) => void;
  onMessageRead?: (data: { messageId: string; userId: string }) => void;
  onBatchDelivered?: (data: BatchStatusUpdatePayload) => void;
  onBatchRead?: (data: BatchStatusUpdatePayload) => void;
}

export function useSocket(options: UseSocketOptions) {
  const {
    userId,
    username,
    onMessage,
    onTypingStart,
    onTypingStop,
    onTypingUpdate,
    onUserOnline,
    onUserOffline,
    onMessageDelivered,
    onMessageRead,
    onBatchDelivered,
    onBatchRead,
  } = options;

  const socketRef = useRef<SocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Typing debounce refs
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const isTypingRef = useRef<Map<string, boolean>>(new Map());
  
  // Batch receipt refs
  const deliveredQueueRef = useRef<Map<string, Set<string>>>(new Map());
  const readQueueRef = useRef<Map<string, Set<string>>>(new Map());
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Flush batched receipts
  const flushReceipts = useCallback(() => {
    if (!socketRef.current?.connected) return;

    // Flush delivered receipts
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

    // Flush read receipts
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

  // Schedule flush if not already scheduled
  const scheduleFlush = useCallback(() => {
    if (!flushTimeoutRef.current) {
      flushTimeoutRef.current = setTimeout(flushReceipts, SOCKET_THROTTLE.BATCH_RECEIPTS_MS);
    }
  }, [flushReceipts]);

  useEffect(() => {
    if (!userId || !username) return;

    // Use separate socket server URL in production, same origin in development
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    console.log('Socket URL:', socketUrl, 'ENV:', process.env.NEXT_PUBLIC_SOCKET_URL);
    
    const socket: SocketClient = io(socketUrl, {
      auth: { userId, username },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;
    // Set socket reference for presence hook
    setPresenceSocket(socket);

    // Get presence store methods
    const { setPresence, setPresenceBulk } = usePresenceStore.getState();

    socket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socket.on('message:new', (message) => {
      onMessage?.(message);
    });

    socket.on('typing:start', (data) => {
      onTypingStart?.(data);
    });

    socket.on('typing:stop', (data) => {
      onTypingStop?.(data);
    });

    socket.on('typing:update', (data) => {
      onTypingUpdate?.(data);
    });

    socket.on('message:delivered', (data) => {
      onMessageDelivered?.({ messageId: data.messageId, userId: data.userId });
    });

    socket.on('message:read', (data) => {
      onMessageRead?.({ messageId: data.messageId, userId: data.userId });
    });

    socket.on('message:delivered:batch', (data) => {
      onBatchDelivered?.(data);
    });

    socket.on('message:read:batch', (data) => {
      onBatchRead?.(data);
    });

    socket.on('user:online', (id) => {
      setPresence(id, 'online', new Date());
      onUserOnline?.(id);
    });

    socket.on('user:offline', (id) => {
      setPresence(id, 'offline', new Date());
      onUserOffline?.(id);
    });

    socket.on('presence:update', (data: PresencePayload) => {
      setPresence(data.userId, data.status, new Date(data.lastSeen));
    });

    socket.on('presence:bulk', (data: PresencePayload[]) => {
      const presences = data.map(d => ({
        userId: d.userId,
        status: d.status,
        lastSeen: new Date(d.lastSeen),
      }));
      setPresenceBulk(presences);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return () => {
      // Clear all typing timeouts
      typingTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutRef.current.clear();
      
      // Flush any pending receipts before disconnect
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushReceipts();
      }
      
      socket.disconnect();
      socketRef.current = null;
      setPresenceSocket(null);
    };
  }, [userId, username, onMessage, onTypingStart, onTypingStop, onTypingUpdate, 
      onUserOnline, onUserOffline, onMessageDelivered, onMessageRead, 
      onBatchDelivered, onBatchRead, flushReceipts]);

  const joinConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('conversation:join', conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('conversation:leave', conversationId);
  }, []);

  const sendMessage = useCallback(
    (data: SendMessagePayload): Promise<MessageResponse> => {
      return new Promise((resolve) => {
        if (!socketRef.current?.connected) {
          resolve({ success: false, error: 'Not connected' });
          return;
        }
        // Stop typing when sending
        const conversationId = data.conversationId;
        if (isTypingRef.current.get(conversationId)) {
          socketRef.current?.emit('typing:stop', conversationId);
          isTypingRef.current.set(conversationId, false);
        }
        socketRef.current.emit('message:send', data, resolve);
      });
    },
    []
  );

  // Debounced typing - only emits if not already typing, auto-stops after timeout
  const startTyping = useCallback((conversationId: string) => {
    // Clear existing timeout
    const existingTimeout = typingTimeoutRef.current.get(conversationId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Only emit if not already marked as typing
    if (!isTypingRef.current.get(conversationId)) {
      isTypingRef.current.set(conversationId, true);
      socketRef.current?.emit('typing:start', conversationId);
    }

    // Set auto-stop timeout
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

  // Batched delivery confirmation - queues and flushes periodically
  const markDelivered = useCallback((messageId: string, conversationId: string) => {
    if (!deliveredQueueRef.current.has(conversationId)) {
      deliveredQueueRef.current.set(conversationId, new Set());
    }
    deliveredQueueRef.current.get(conversationId)!.add(messageId);
    scheduleFlush();
  }, [scheduleFlush]);

  // Batched read receipt - queues and flushes periodically
  const markRead = useCallback((messageId: string, conversationId: string) => {
    if (!readQueueRef.current.has(conversationId)) {
      readQueueRef.current.set(conversationId, new Set());
    }
    readQueueRef.current.get(conversationId)!.add(messageId);
    scheduleFlush();
  }, [scheduleFlush]);

  // Batch mark multiple messages as delivered
  const markDeliveredBatch = useCallback((messageIds: string[], conversationId: string) => {
    if (!deliveredQueueRef.current.has(conversationId)) {
      deliveredQueueRef.current.set(conversationId, new Set());
    }
    const queue = deliveredQueueRef.current.get(conversationId)!;
    messageIds.forEach(id => queue.add(id));
    scheduleFlush();
  }, [scheduleFlush]);

  // Batch mark multiple messages as read
  const markReadBatch = useCallback((messageIds: string[], conversationId: string) => {
    if (!readQueueRef.current.has(conversationId)) {
      readQueueRef.current.set(conversationId, new Set());
    }
    const queue = readQueueRef.current.get(conversationId)!;
    messageIds.forEach(id => queue.add(id));
    scheduleFlush();
  }, [scheduleFlush]);

  // Force flush receipts immediately (useful when leaving conversation)
  const flushReceiptsNow = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushReceipts();
  }, [flushReceipts]);

  // Subscribe to presence updates for specific users
  const subscribeToPresence = useCallback((userIds: string[]) => {
    if (socketRef.current?.connected && userIds.length > 0) {
      socketRef.current.emit('presence:subscribe', userIds);
    }
  }, []);

  // Unsubscribe from presence updates
  const unsubscribeFromPresence = useCallback((userIds: string[]) => {
    if (socketRef.current?.connected && userIds.length > 0) {
      socketRef.current.emit('presence:unsubscribe', userIds);
    }
  }, []);

  return {
    isConnected,
    joinConversation,
    leaveConversation,
    sendMessage,
    startTyping,
    stopTyping,
    markDelivered,
    markRead,
    markDeliveredBatch,
    markReadBatch,
    flushReceiptsNow,
    subscribeToPresence,
    unsubscribeFromPresence,
  };
}
