'use client';

import { useCallback, useRef, useMemo } from 'react';
import { useMessageStore, generateTempId } from '@/store';
import { MessageStatus } from '@/types';

const EMPTY_ARRAY: never[] = [];

interface SendMessageOptions {
  conversationId: string;
  content: string;
  senderId: string;
  senderName?: string;
  senderImage?: string;
  replyToId?: string;
  replyToMessage?: {
    _id: string;
    content: string;
    sender: { _id: string; username?: string };
  };
}

interface UseOptimisticMessagesOptions {
  onSend?: (message: { tempId: string; content: string; conversationId: string; replyToId?: string }) => Promise<{ _id: string } | void>;
  timeout?: number;
}

export function useOptimisticMessages(options: UseOptimisticMessagesOptions = {}) {
  const { onSend, timeout = 30000 } = options;
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  const {
    messagesByConversation,
    addOptimisticMessage,
    confirmMessage,
    failMessage,
    retryMessage,
    removeMessage,
  } = useMessageStore();

  const sendMessage = useCallback(async ({
    conversationId,
    content,
    senderId,
    senderName,
    senderImage,
    replyToId,
    replyToMessage,
  }: SendMessageOptions) => {
    const tempId = generateTempId();
    const now = new Date().toISOString();

    // Create optimistic message
    const optimisticMessage = {
      _id: tempId,
      tempId,
      content,
      sender: {
        _id: senderId,
        username: senderName,
        name: senderName,
        image: senderImage,
      },
      createdAt: now,
      type: 'text',
      status: 'sending' as MessageStatus,
      replyTo: replyToId,
      replyToMessage,
    };

    // Add to store immediately (optimistic)
    addOptimisticMessage(conversationId, optimisticMessage);

    // Set timeout for failed status
    const timeoutId = setTimeout(() => {
      failMessage(conversationId, tempId, 'Message timed out');
      timeoutRefs.current.delete(tempId);
    }, timeout);
    timeoutRefs.current.set(tempId, timeoutId);

    // Send to server
    if (onSend) {
      try {
        const result = await onSend({ tempId, content, conversationId, replyToId });
        
        // Clear timeout
        const tid = timeoutRefs.current.get(tempId);
        if (tid) {
          clearTimeout(tid);
          timeoutRefs.current.delete(tempId);
        }

        // Confirm message with server ID
        if (result?._id) {
          confirmMessage(conversationId, tempId, {
            ...optimisticMessage,
            _id: result._id,
            status: 'sent',
          });
        }
      } catch (error) {
        // Clear timeout
        const tid = timeoutRefs.current.get(tempId);
        if (tid) {
          clearTimeout(tid);
          timeoutRefs.current.delete(tempId);
        }
        
        failMessage(
          conversationId,
          tempId,
          error instanceof Error ? error.message : 'Failed to send'
        );
      }
    }

    return tempId;
  }, [addOptimisticMessage, confirmMessage, failMessage, onSend, timeout]);

  const retry = useCallback(async (conversationId: string, tempId: string) => {
    const message = retryMessage(conversationId, tempId);
    if (!message || !onSend) return;

    // Set new timeout
    const timeoutId = setTimeout(() => {
      failMessage(conversationId, tempId, 'Message timed out');
      timeoutRefs.current.delete(tempId);
    }, timeout);
    timeoutRefs.current.set(tempId, timeoutId);

    try {
      const result = await onSend({
        tempId,
        content: message.content,
        conversationId,
        replyToId: message.replyTo,
      });

      const tid = timeoutRefs.current.get(tempId);
      if (tid) {
        clearTimeout(tid);
        timeoutRefs.current.delete(tempId);
      }

      if (result?._id) {
        confirmMessage(conversationId, tempId, {
          ...message,
          _id: result._id,
          status: 'sent',
        });
      }
    } catch (error) {
      const tid = timeoutRefs.current.get(tempId);
      if (tid) {
        clearTimeout(tid);
        timeoutRefs.current.delete(tempId);
      }
      failMessage(
        conversationId,
        tempId,
        error instanceof Error ? error.message : 'Failed to send'
      );
    }
  }, [retryMessage, onSend, timeout, confirmMessage, failMessage]);

  const cancel = useCallback((conversationId: string, tempId: string) => {
    const tid = timeoutRefs.current.get(tempId);
    if (tid) {
      clearTimeout(tid);
      timeoutRefs.current.delete(tempId);
    }
    removeMessage(conversationId, tempId);
  }, [removeMessage]);

  return {
    sendMessage,
    retry,
    cancel,
    messagesByConversation,
  };
}
