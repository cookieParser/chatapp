'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatTab {
  id: string;
  type: 'channel' | 'group' | 'direct';
  name: string;
  image?: string;
  participantId?: string; // For direct messages
}

interface ChatState {
  // Active chat tabs
  activeTabs: ChatTab[];
  // Currently focused tab
  activeTabId: string | null;
  // Maximum number of tabs allowed
  maxTabs: number;
  // Mobile sidebar visibility
  isMobileSidebarOpen: boolean;

  // Actions
  openChat: (chat: ChatTab) => void;
  closeChat: (chatId: string) => void;
  setActiveTab: (chatId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  clearAllTabs: () => void;
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      activeTabs: [],
      activeTabId: null,
      maxTabs: 10,
      isMobileSidebarOpen: false,

      openChat: (chat) => {
        const state = get();
        
        // Check if chat is already open
        const existingIndex = state.activeTabs.findIndex(t => t.id === chat.id);
        if (existingIndex !== -1) {
          // Just focus the existing tab
          set({ activeTabId: chat.id, isMobileSidebarOpen: false });
          return;
        }

        // If at max tabs, remove the oldest one
        let newTabs = [...state.activeTabs];
        if (newTabs.length >= state.maxTabs) {
          newTabs = newTabs.slice(1);
        }

        newTabs.push(chat);
        set({ activeTabs: newTabs, activeTabId: chat.id, isMobileSidebarOpen: false });
      },

      closeChat: (chatId) => {
        set((state) => {
          const newTabs = state.activeTabs.filter(t => t.id !== chatId);
          let newActiveId = state.activeTabId;
          
          // If closing the active tab, switch to another
          if (state.activeTabId === chatId) {
            const closedIndex = state.activeTabs.findIndex(t => t.id === chatId);
            if (newTabs.length > 0) {
              // Try to select the tab to the left, or the first one
              const newIndex = Math.max(0, closedIndex - 1);
              newActiveId = newTabs[newIndex]?.id || null;
            } else {
              newActiveId = null;
            }
          }

          return { activeTabs: newTabs, activeTabId: newActiveId };
        });
      },

      setActiveTab: (chatId) => {
        const state = get();
        if (state.activeTabs.some(t => t.id === chatId)) {
          set({ activeTabId: chatId });
        }
      },

      reorderTabs: (fromIndex, toIndex) => {
        set((state) => {
          const newTabs = [...state.activeTabs];
          const [removed] = newTabs.splice(fromIndex, 1);
          newTabs.splice(toIndex, 0, removed);
          return { activeTabs: newTabs };
        });
      },

      clearAllTabs: () => {
        set({ activeTabs: [], activeTabId: null });
      },

      toggleMobileSidebar: () => {
        set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen }));
      },

      setMobileSidebarOpen: (open) => {
        set({ isMobileSidebarOpen: open });
      },
    }),
    {
      name: 'chat-tabs-storage',
      partialize: (state) => ({
        activeTabs: state.activeTabs,
        activeTabId: state.activeTabId,
      }),
      // Clear stale data on version change
      version: 2,
      migrate: () => {
        // Clear all tabs on migration to avoid stale conversation IDs
        return { activeTabs: [], activeTabId: null };
      },
    }
  )
);
