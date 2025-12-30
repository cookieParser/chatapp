'use client';

import { create } from 'zustand';
import { MessageStatus } from '@/types';

export interface OptimisticMessage {
  _id: string;
  tempId: string;
  content: string;
  sender: {
    _id: string;
    username?: string;
    name?: string;
    image?: string;
  };
  createdAt: string;
  type: string;
  status: MessageStatus;
  replyTo?: string;
  replyToMessage?: {
    _id: string;
    content: string;
    sender: {
      _id: string;
      username?: string;
    };
    isDeleted?: boolean;
  };
  isDeleted?: boolean;
  error?: string;
}

interface MessageState {
  // Messages by conversation ID
  messagesByConversation: Record<string, OptimisticMessage[]>;

  // Actions
  addOptimisticMessage: (conversationId: string, message: OptimisticMessage) => void;
  confirmMessage: (conversationId: string, tempId: string, confirmedMessage: OptimisticMessage) => void;
  failMessage: (conversationId: string, tempId: string, error?: string) => void;
  retryMessage: (conversationId: string, tempId: string) => OptimisticMessage | null;
  removeMessage: (conversationId: string, messageId: string) => void;
  setMessages: (conversationId: string, messages: OptimisticMessage[]) => void;
  addIncomingMessage: (conversationId: string, message: OptimisticMessage) => void;
  markMessageDeleted: (conversationId: string, messageId: string) => void;
  clearConversation: (conversationId: string) => void;
}

// Generate a temporary ID for optimistic messages
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const useMessageStore = create<MessageState>()((set, get) => ({
  messagesByConversation: {},

  addOptimisticMessage: (conversationId, message) => {
    set((state) => {
      const existing = state.messagesByConversation[conversationId] || [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...existing, message],
        },
      };
    });
  },

  confirmMessage: (conversationId, tempId, confirmedMessage) => {
    set((state) => {
      const messages = state.messagesByConversation[conversationId] || [];
      const updatedMessages = messages.map((msg) =>
        msg.tempId === tempId
          ? { ...confirmedMessage, tempId, status: 'sent' as MessageStatus }
          : msg
      );
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: updatedMessages,
        },
      };
    });
  },

  failMessage: (conversationId, tempId, error) => {
    set((state) => {
      const messages = state.messagesByConversation[conversationId] || [];
      const updatedMessages = messages.map((msg) =>
        msg.tempId === tempId
          ? { ...msg, status: 'failed' as MessageStatus, error: error || 'Failed to send' }
          : msg
      );
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: updatedMessages,
        },
      };
    });
  },

  retryMessage: (conversationId, tempId) => {
    const state = get();
    const messages = state.messagesByConversation[conversationId] || [];
    const message = messages.find((msg) => msg.tempId === tempId);
    
    if (message && message.status === 'failed') {
      set((state) => {
        const msgs = state.messagesByConversation[conversationId] || [];
        const updatedMessages = msgs.map((msg) =>
          msg.tempId === tempId
            ? { ...msg, status: 'sending' as MessageStatus, error: undefined }
            : msg
        );
        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: updatedMessages,
          },
        };
      });
      return message;
    }
    return null;
  },

  removeMessage: (conversationId, messageId) => {
    set((state) => {
      const messages = state.messagesByConversation[conversationId] || [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: messages.filter(
            (msg) => msg._id !== messageId && msg.tempId !== messageId
          ),
        },
      };
    });
  },

  setMessages: (conversationId, messages) => {
    set((state) => {
      // Preserve any pending/failed optimistic messages
      const existing = state.messagesByConversation[conversationId] || [];
      const pendingMessages = existing.filter(
        (msg) => msg.status === 'sending' || msg.status === 'failed'
      );
      
      // Merge server messages with pending ones
      const serverMessageIds = new Set(messages.map((m) => m._id));
      const uniquePending = pendingMessages.filter(
        (msg) => !serverMessageIds.has(msg._id)
      );

      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...messages, ...uniquePending],
        },
      };
    });
  },

  addIncomingMessage: (conversationId, message) => {
    set((state) => {
      const existing = state.messagesByConversation[conversationId] || [];
      // Avoid duplicates
      if (existing.some((m) => m._id === message._id)) {
        return state;
      }
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...existing, message],
        },
      };
    });
  },

  markMessageDeleted: (conversationId, messageId) => {
    set((state) => {
      const messages = state.messagesByConversation[conversationId] || [];
      const updatedMessages = messages.map((msg) =>
        msg._id === messageId
          ? { ...msg, isDeleted: true, content: 'This message was deleted' }
          : msg
      );
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: updatedMessages,
        },
      };
    });
  },

  clearConversation: (conversationId) => {
    set((state) => {
      const { [conversationId]: _, ...rest } = state.messagesByConversation;
      return { messagesByConversation: rest };
    });
  },
}));
