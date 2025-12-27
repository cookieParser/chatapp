'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageStatus } from '@/types/message';

interface MessageStatusState {
  [messageId: string]: {
    status: MessageStatus;
    deliveredBy: string[];
    readBy: string[];
  };
}

interface UseMessageStatusOptions {
  userId: string;
  markDelivered: (messageId: string, conversationId: string) => void;
  markRead: (messageId: string, conversationId: string) => void;
  markDeliveredBatch: (messageIds: string[], conversationId: string) => void;
  markReadBatch: (messageIds: string[], conversationId: string) => void;
}

export function useMessageStatus(options: UseMessageStatusOptions) {
  const { userId, markDelivered, markRead, markDeliveredBatch, markReadBatch } = options;
  const [statusMap, setStatusMap] = useState<MessageStatusState>({});
  const pendingDeliveryRef = useRef<Set<string>>(new Set());
  const pendingReadRef = useRef<Set<string>>(new Set());

  // Initialize message status
  const initializeMessage = useCallback((messageId: string, senderId: string) => {
    setStatusMap(prev => {
      if (prev[messageId]) return prev;
      return {
        ...prev,
        [messageId]: {
          status: senderId === userId ? 'sent' : 'delivered',
          deliveredBy: senderId === userId ? [] : [userId],
          readBy: [],
        },
      };
    });
  }, [userId]);

  // Handle incoming message - auto mark as delivered
  const handleNewMessage = useCallback((
    messageId: string,
    senderId: string,
    conversationId: string
  ) => {
    if (senderId === userId) {
      // Own message - mark as sent
      setStatusMap(prev => ({
        ...prev,
        [messageId]: {
          status: 'sent',
          deliveredBy: [],
          readBy: [],
        },
      }));
    } else {
      // Other's message - mark as delivered
      if (!pendingDeliveryRef.current.has(messageId)) {
        pendingDeliveryRef.current.add(messageId);
        markDelivered(messageId, conversationId);
        setStatusMap(prev => ({
          ...prev,
          [messageId]: {
            status: 'delivered',
            deliveredBy: [userId],
            readBy: [],
          },
        }));
      }
    }
  }, [userId, markDelivered]);

  // Mark message as read when viewed
  const handleMessageViewed = useCallback((
    messageId: string,
    senderId: string,
    conversationId: string
  ) => {
    if (senderId !== userId && !pendingReadRef.current.has(messageId)) {
      pendingReadRef.current.add(messageId);
      markRead(messageId, conversationId);
      setStatusMap(prev => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          status: 'read',
          readBy: [...(prev[messageId]?.readBy || []), userId],
        },
      }));
    }
  }, [userId, markRead]);

  // Batch mark messages as read (e.g., when scrolling into view)
  const handleMessagesViewed = useCallback((
    messages: Array<{ id: string; senderId: string }>,
    conversationId: string
  ) => {
    const toMark = messages
      .filter(m => m.senderId !== userId && !pendingReadRef.current.has(m.id))
      .map(m => m.id);

    if (toMark.length > 0) {
      toMark.forEach(id => pendingReadRef.current.add(id));
      markReadBatch(toMark, conversationId);
      
      setStatusMap(prev => {
        const updates: MessageStatusState = {};
        toMark.forEach(id => {
          updates[id] = {
            ...prev[id],
            status: 'read',
            readBy: [...(prev[id]?.readBy || []), userId],
          };
        });
        return { ...prev, ...updates };
      });
    }
  }, [userId, markReadBatch]);

  // Handle delivery confirmation from server
  const handleDeliveryConfirmation = useCallback((messageId: string, deliveredByUserId: string) => {
    setStatusMap(prev => {
      const current = prev[messageId];
      if (!current) return prev;
      
      const deliveredBy = current.deliveredBy.includes(deliveredByUserId)
        ? current.deliveredBy
        : [...current.deliveredBy, deliveredByUserId];
      
      return {
        ...prev,
        [messageId]: {
          ...current,
          status: current.status === 'read' ? 'read' : 'delivered',
          deliveredBy,
        },
      };
    });
  }, []);

  // Handle read confirmation from server
  const handleReadConfirmation = useCallback((messageId: string, readByUserId: string) => {
    setStatusMap(prev => {
      const current = prev[messageId];
      if (!current) return prev;
      
      const readBy = current.readBy.includes(readByUserId)
        ? current.readBy
        : [...current.readBy, readByUserId];
      
      return {
        ...prev,
        [messageId]: {
          ...current,
          status: 'read',
          readBy,
        },
      };
    });
  }, []);

  // Handle batch delivery confirmation
  const handleBatchDeliveryConfirmation = useCallback((
    messageIds: string[],
    deliveredByUserId: string
  ) => {
    setStatusMap(prev => {
      const updates: MessageStatusState = {};
      messageIds.forEach(id => {
        const current = prev[id];
        if (current && !current.deliveredBy.includes(deliveredByUserId)) {
          updates[id] = {
            ...current,
            status: current.status === 'read' ? 'read' : 'delivered',
            deliveredBy: [...current.deliveredBy, deliveredByUserId],
          };
        }
      });
      return { ...prev, ...updates };
    });
  }, []);

  // Handle batch read confirmation
  const handleBatchReadConfirmation = useCallback((
    messageIds: string[],
    readByUserId: string
  ) => {
    setStatusMap(prev => {
      const updates: MessageStatusState = {};
      messageIds.forEach(id => {
        const current = prev[id];
        if (current && !current.readBy.includes(readByUserId)) {
          updates[id] = {
            ...current,
            status: 'read',
            readBy: [...current.readBy, readByUserId],
          };
        }
      });
      return { ...prev, ...updates };
    });
  }, []);

  // Get status for a specific message
  const getMessageStatus = useCallback((messageId: string): MessageStatus => {
    return statusMap[messageId]?.status || 'sending';
  }, [statusMap]);

  // Get detailed status info
  const getMessageStatusInfo = useCallback((messageId: string) => {
    return statusMap[messageId] || { status: 'sending' as MessageStatus, deliveredBy: [], readBy: [] };
  }, [statusMap]);

  // Clear status for removed messages
  const clearMessageStatus = useCallback((messageId: string) => {
    pendingDeliveryRef.current.delete(messageId);
    pendingReadRef.current.delete(messageId);
    setStatusMap(prev => {
      const { [messageId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    statusMap,
    initializeMessage,
    handleNewMessage,
    handleMessageViewed,
    handleMessagesViewed,
    handleDeliveryConfirmation,
    handleReadConfirmation,
    handleBatchDeliveryConfirmation,
    handleBatchReadConfirmation,
    getMessageStatus,
    getMessageStatusInfo,
    clearMessageStatus,
  };
}
