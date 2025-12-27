'use client';

import { useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useNotifications } from '@/hooks/useNotifications';

interface NotificationContextValue {
  totalUnread: number;
  getUnreadCount: (conversationId: string) => number;
  markAsRead: (conversationId: string) => Promise<void>;
  handleNewMessage: (conversationId: string, senderName: string, content: string) => void;
  isConversationMuted: (conversationId: string) => boolean;
  mute: (conversationId: string, duration?: number) => Promise<void>;
  unmute: (conversationId: string) => Promise<void>;
}

const defaultContext: NotificationContextValue = {
  totalUnread: 0,
  getUnreadCount: () => 0,
  markAsRead: async () => {},
  handleNewMessage: () => {},
  isConversationMuted: () => false,
  mute: async () => {},
  unmute: async () => {},
};

const NotificationContext = createContext<NotificationContextValue>(defaultContext);

export function useNotificationContext() {
  return useContext(NotificationContext);
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { status } = useSession();
  const {
    totalUnread,
    fetchUnreadCounts,
    fetchPreferences,
    markAsRead,
    handleNewMessage,
    getUnreadCount,
    isConversationMuted,
    mute,
    unmute,
  } = useNotifications();

  // Fetch initial data when authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      fetchUnreadCounts();
      fetchPreferences();
    }
  }, [status, fetchUnreadCounts, fetchPreferences]);

  // Update document title with unread count
  useEffect(() => {
    const baseTitle = 'ChatApp';
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [totalUnread]);

  const value: NotificationContextValue = {
    totalUnread,
    getUnreadCount,
    markAsRead,
    handleNewMessage,
    isConversationMuted,
    mute,
    unmute,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
