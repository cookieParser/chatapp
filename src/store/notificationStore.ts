'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UnreadCount {
  conversationId: string;
  count: number;
}

interface NotificationState {
  // Unread counts per conversation
  unreadCounts: Map<string, number>;
  // Total unread count
  totalUnread: number;
  // Muted conversations (local cache)
  mutedConversations: Set<string>;
  // Push notification permission status
  pushPermission: NotificationPermission | 'default';
  // Sound enabled
  soundEnabled: boolean;

  // Actions
  setUnreadCount: (conversationId: string, count: number) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  setUnreadCounts: (counts: UnreadCount[]) => void;
  
  muteConversation: (conversationId: string) => void;
  unmuteConversation: (conversationId: string) => void;
  setMutedConversations: (conversationIds: string[]) => void;
  isConversationMuted: (conversationId: string) => boolean;
  
  setPushPermission: (permission: NotificationPermission) => void;
  setSoundEnabled: (enabled: boolean) => void;
  
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      unreadCounts: new Map(),
      totalUnread: 0,
      mutedConversations: new Set(),
      pushPermission: 'default',
      soundEnabled: true,

      setUnreadCount: (conversationId, count) => {
        set((state) => {
          const newCounts = new Map(state.unreadCounts);
          newCounts.set(conversationId, count);
          const totalUnread = Array.from(newCounts.values()).reduce((a, b) => a + b, 0);
          return { unreadCounts: newCounts, totalUnread };
        });
      },

      incrementUnread: (conversationId) => {
        const state = get();
        // Don't increment if conversation is muted
        if (state.mutedConversations.has(conversationId)) return;
        
        set((state) => {
          const newCounts = new Map(state.unreadCounts);
          const current = newCounts.get(conversationId) || 0;
          newCounts.set(conversationId, current + 1);
          return { 
            unreadCounts: newCounts, 
            totalUnread: state.totalUnread + 1 
          };
        });
      },

      clearUnread: (conversationId) => {
        set((state) => {
          const newCounts = new Map(state.unreadCounts);
          const cleared = newCounts.get(conversationId) || 0;
          newCounts.delete(conversationId);
          return { 
            unreadCounts: newCounts, 
            totalUnread: Math.max(0, state.totalUnread - cleared) 
          };
        });
      },

      setUnreadCounts: (counts) => {
        set(() => {
          const newCounts = new Map<string, number>();
          let total = 0;
          counts.forEach(({ conversationId, count }) => {
            newCounts.set(conversationId, count);
            total += count;
          });
          return { unreadCounts: newCounts, totalUnread: total };
        });
      },

      muteConversation: (conversationId) => {
        set((state) => {
          const newMuted = new Set(state.mutedConversations);
          newMuted.add(conversationId);
          return { mutedConversations: newMuted };
        });
      },

      unmuteConversation: (conversationId) => {
        set((state) => {
          const newMuted = new Set(state.mutedConversations);
          newMuted.delete(conversationId);
          return { mutedConversations: newMuted };
        });
      },

      setMutedConversations: (conversationIds) => {
        set({ mutedConversations: new Set(conversationIds) });
      },

      isConversationMuted: (conversationId) => {
        return get().mutedConversations.has(conversationId);
      },

      setPushPermission: (permission) => {
        set({ pushPermission: permission });
      },

      setSoundEnabled: (enabled) => {
        set({ soundEnabled: enabled });
      },

      reset: () => {
        set({
          unreadCounts: new Map(),
          totalUnread: 0,
          mutedConversations: new Set(),
        });
      },
    }),
    {
      name: 'notification-storage',
      partialize: (state) => ({
        soundEnabled: state.soundEnabled,
        // Convert Set to array for storage
        mutedConversations: Array.from(state.mutedConversations),
      }),
      merge: (persisted: any, current) => ({
        ...current,
        soundEnabled: persisted?.soundEnabled ?? true,
        mutedConversations: new Set(persisted?.mutedConversations || []),
      }),
    }
  )
);
