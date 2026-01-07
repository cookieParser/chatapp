/**
 * Offline-First Data Hook
 * 
 * Loads data from IndexedDB first (instant), then syncs with server.
 * Provides WhatsApp-like instant loading experience.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getConversations,
  getMessages,
  getAllMessages,
  saveConversations,
  saveMessages,
  toStoredConversation,
  toStoredMessage,
  fromStoredConversation,
  fromStoredMessage,
  performDeltaSync,
  syncConversationMessages,
  handleIncomingMessage,
  queueMessage,
  getPendingMessagesForConversation,
  removePendingMessage,
  updatePendingMessageStatus,
  resetUnreadCount,
  StoredMessage,
  StoredConversation,
} from '@/lib/offline';
import { registerBackgroundSync } from '@/lib/offline/backgroundSync';

interface UseOfflineConversationsOptions {
  userId: string;
  enabled?: boolean;
}

interface UseOfflineMessagesOptions {
  conversationId: string;
  userId: string;
  enabled?: boolean;
}

/**
 * Hook for offline-first conversation list
 */
export function useOfflineConversations({ userId, enabled = true }: UseOfflineConversationsOptions) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncedRef = useRef(false);

  // Load from IndexedDB immediately
  useEffect(() => {
    if (!enabled || !userId) return;

    const loadLocal = async () => {
      try {
        const stored = await getConversations();
        if (stored.length > 0) {
          setConversations(stored.map(fromStoredConversation));
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to load conversations from IndexedDB:', err);
      }
    };

    loadLocal();
  }, [enabled, userId]);

  // Background sync with server
  useEffect(() => {
    if (!enabled || !userId || syncedRef.current) return;

    const syncWithServer = async () => {
      setIsSyncing(true);
      try {
        const result = await performDeltaSync(userId);
        
        if (result.success && result.updatedConversations > 0) {
          // Reload from IndexedDB after sync
          const stored = await getConversations();
          setConversations(stored.map(fromStoredConversation));
        }
        
        syncedRef.current = true;
      } catch (err) {
        console.error('Sync failed:', err);
        setError('Failed to sync conversations');
      } finally {
        setIsSyncing(false);
        setIsLoading(false);
      }
    };

    syncWithServer();
  }, [enabled, userId]);

  // Refresh function for pull-to-refresh
  const refresh = useCallback(async () => {
    if (!userId) return;
    
    setIsSyncing(true);
    syncedRef.current = false;
    
    try {
      const result = await performDeltaSync(userId);
      if (result.success) {
        const stored = await getConversations();
        setConversations(stored.map(fromStoredConversation));
      }
    } finally {
      setIsSyncing(false);
      syncedRef.current = true;
    }
  }, [userId]);

  return {
    conversations,
    isLoading,
    isSyncing,
    error,
    refresh,
  };
}

/**
 * Hook for offline-first messages in a conversation
 */
export function useOfflineMessages({ conversationId, userId, enabled = true }: UseOfflineMessagesOptions) {
  const [messages, setMessages] = useState<any[]>([]);
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const oldestTimestampRef = useRef<number | null>(null);
  const syncedRef = useRef(false);

  // Load from IndexedDB immediately
  useEffect(() => {
    if (!enabled || !conversationId) return;

    const loadLocal = async () => {
      try {
        // Load messages
        const stored = await getAllMessages(conversationId);
        if (stored.length > 0) {
          setMessages(stored.map(fromStoredMessage));
          oldestTimestampRef.current = stored[0]?.createdAt || null;
          setIsLoading(false);
        }

        // Load pending messages
        const pending = await getPendingMessagesForConversation(conversationId);
        if (pending.length > 0) {
          setPendingMessages(pending.map(p => ({
            _id: p.tempId,
            tempId: p.tempId,
            content: p.content,
            type: p.type,
            createdAt: new Date(p.createdAt).toISOString(),
            status: p.status,
            sender: { _id: userId },
            isPending: true,
          })));
        }
      } catch (err) {
        console.error('Failed to load messages from IndexedDB:', err);
      }
    };

    loadLocal();
  }, [enabled, conversationId, userId]);

  // Background sync with server
  useEffect(() => {
    if (!enabled || !conversationId || !userId || syncedRef.current) return;

    const syncWithServer = async () => {
      setIsSyncing(true);
      try {
        const result = await syncConversationMessages(conversationId, userId);
        
        if (result.success && result.newMessages > 0) {
          const stored = await getAllMessages(conversationId);
          setMessages(stored.map(fromStoredMessage));
        }
        
        syncedRef.current = true;
      } catch (err) {
        console.error('Message sync failed:', err);
      } finally {
        setIsSyncing(false);
        setIsLoading(false);
      }
    };

    syncWithServer();
  }, [enabled, conversationId, userId]);

  // Load older messages (pagination)
  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore || !oldestTimestampRef.current) return;

    try {
      const older = await getMessages(conversationId, {
        limit: 50,
        beforeTimestamp: oldestTimestampRef.current,
      });

      if (older.length === 0) {
        setHasMore(false);
        return;
      }

      oldestTimestampRef.current = older[0]?.createdAt || null;
      setMessages(prev => [...older.map(fromStoredMessage), ...prev]);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  }, [conversationId, hasMore]);

  // Add incoming message (from socket/push)
  const addMessage = useCallback(async (message: any) => {
    // Save to IndexedDB
    await handleIncomingMessage({
      messageId: message._id || message.messageId,
      conversationId,
      senderId: message.senderId || message.sender?._id,
      senderName: message.senderName || message.sender?.username,
      content: message.content,
      type: message.type,
      createdAt: message.createdAt,
    }, userId);

    // Update state
    setMessages(prev => {
      // Avoid duplicates
      if (prev.some(m => m._id === message._id)) return prev;
      return [...prev, message];
    });
  }, [conversationId, userId]);

  // Send message (with offline support)
  const sendMessage = useCallback(async (content: string, type: string = 'text', replyToId?: string) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // Add optimistic message
    const optimisticMessage = {
      _id: tempId,
      tempId,
      content,
      type,
      createdAt: new Date(now).toISOString(),
      status: 'sending',
      sender: { _id: userId },
      replyTo: replyToId,
      isPending: true,
    };

    setPendingMessages(prev => [...prev, optimisticMessage]);

    // Queue for offline sync
    await queueMessage({
      tempId,
      conversationId,
      content,
      type: type as any,
      replyToId,
      createdAt: now,
    });

    // Register background sync
    await registerBackgroundSync();

    return tempId;
  }, [conversationId, userId]);

  // Confirm sent message
  const confirmMessage = useCallback(async (tempId: string, confirmedMessage: any) => {
    // Remove from pending
    await removePendingMessage(tempId);
    setPendingMessages(prev => prev.filter(m => m.tempId !== tempId));

    // Add confirmed message
    const stored = toStoredMessage(confirmedMessage);
    stored.tempId = tempId;
    await saveMessages([stored]);

    setMessages(prev => {
      // Replace optimistic with confirmed
      const filtered = prev.filter(m => m.tempId !== tempId && m._id !== confirmedMessage._id);
      return [...filtered, fromStoredMessage(stored)];
    });
  }, []);

  // Mark message as failed
  const failMessage = useCallback(async (tempId: string) => {
    await updatePendingMessageStatus(tempId, 'failed', true);
    setPendingMessages(prev => 
      prev.map(m => m.tempId === tempId ? { ...m, status: 'failed' } : m)
    );
  }, []);

  // Mark conversation as read
  const markAsRead = useCallback(async () => {
    await resetUnreadCount(conversationId);
  }, [conversationId]);

  // Combined messages (confirmed + pending)
  const allMessages = [...messages, ...pendingMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return {
    messages: allMessages,
    isLoading,
    isSyncing,
    hasMore,
    loadMore,
    addMessage,
    sendMessage,
    confirmMessage,
    failMessage,
    markAsRead,
  };
}

/**
 * Hook for handling push notification messages
 */
export function usePushMessageHandler(userId: string, onNewMessage?: (message: any) => void) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    const handleServiceWorkerMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'NEW_MESSAGE') {
        const message = event.data.message;
        
        // Message already saved to IndexedDB by service worker
        // Just notify the UI
        onNewMessage?.(message);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [userId, onNewMessage]);
}
