'use client';

import { useEffect, useCallback } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { notificationService } from '@/services/notificationService';

const NOTIFICATION_SOUND_URL = '/sounds/notification.mp3';

export function useNotifications() {
  const {
    unreadCounts,
    totalUnread,
    mutedConversations,
    pushPermission,
    soundEnabled,
    setUnreadCounts,
    incrementUnread,
    clearUnread,
    setMutedConversations,
    muteConversation,
    unmuteConversation,
    isConversationMuted,
    setPushPermission,
    setSoundEnabled,
  } = useNotificationStore();

  // Fetch initial unread counts and preferences
  const fetchUnreadCounts = useCallback(async () => {
    try {
      const counts = await notificationService.getUnreadCounts();
      setUnreadCounts(counts);
    } catch (error) {
      console.error('Failed to fetch unread counts:', error);
    }
  }, [setUnreadCounts]);

  const fetchPreferences = useCallback(async () => {
    try {
      const prefs = await notificationService.getPreferences();
      setMutedConversations(prefs.mutedConversations.map((m) => m.conversationId));
      setSoundEnabled(prefs.soundEnabled);
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
    }
  }, [setMutedConversations, setSoundEnabled]);

  // Mark conversation as read
  const markAsRead = useCallback(
    async (conversationId: string) => {
      try {
        await notificationService.markAsRead(conversationId);
        clearUnread(conversationId);
      } catch (error) {
        console.error('Failed to mark as read:', error);
      }
    },
    [clearUnread]
  );

  // Mute/unmute conversation
  const mute = useCallback(
    async (conversationId: string, duration?: number) => {
      try {
        await notificationService.muteConversation(conversationId, duration);
        muteConversation(conversationId);
      } catch (error) {
        console.error('Failed to mute conversation:', error);
      }
    },
    [muteConversation]
  );

  const unmute = useCallback(
    async (conversationId: string) => {
      try {
        await notificationService.unmuteConversation(conversationId);
        unmuteConversation(conversationId);
      } catch (error) {
        console.error('Failed to unmute conversation:', error);
      }
    },
    [unmuteConversation]
  );

  // Play notification sound
  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    
    try {
      const audio = new Audio(NOTIFICATION_SOUND_URL);
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Ignore autoplay errors or missing file
      });
    } catch {
      // Ignore errors
    }
  }, [soundEnabled]);

  // Show browser notification
  const showBrowserNotification = useCallback(
    (title: string, body: string, conversationId?: string) => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      if (conversationId && isConversationMuted(conversationId)) return;

      try {
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: conversationId || 'chat-notification',
        });

        notification.onclick = () => {
          window.focus();
          if (conversationId) {
            window.location.href = `/chat/${conversationId}`;
          }
          notification.close();
        };
      } catch (error) {
        console.error('Failed to show notification:', error);
      }
    },
    [isConversationMuted]
  );

  // Handle incoming message notification
  const handleNewMessage = useCallback(
    (conversationId: string, senderName: string, content: string) => {
      if (isConversationMuted(conversationId)) return;

      incrementUnread(conversationId);
      playSound();

      // Show browser notification if page is not focused
      if (typeof document !== 'undefined' && document.hidden) {
        showBrowserNotification(senderName, content, conversationId);
      }
    },
    [incrementUnread, playSound, showBrowserNotification, isConversationMuted]
  );

  // Request push notification permission
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }

    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    return permission === 'granted';
  }, [setPushPermission]);

  // Check current permission status
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    }
  }, [setPushPermission]);

  // Get unread count for specific conversation
  const getUnreadCount = useCallback(
    (conversationId: string) => {
      return unreadCounts.get(conversationId) || 0;
    },
    [unreadCounts]
  );

  return {
    // State
    unreadCounts,
    totalUnread,
    mutedConversations,
    pushPermission,
    soundEnabled,

    // Actions
    fetchUnreadCounts,
    fetchPreferences,
    markAsRead,
    mute,
    unmute,
    handleNewMessage,
    requestPermission,
    getUnreadCount,
    isConversationMuted,
    setSoundEnabled,
  };
}
