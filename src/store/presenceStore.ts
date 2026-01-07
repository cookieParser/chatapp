'use client';

import { create } from 'zustand';

export type UserStatus = 'online' | 'offline' | 'away';

export interface UserPresence {
  userId: string;
  status: UserStatus;
  lastSeen: Date | null;
}

interface PresenceState {
  presenceMap: Map<string, UserPresence>;
  setPresence: (userId: string, status: UserStatus, lastSeen: Date | null) => void;
  setPresenceBulk: (presences: UserPresence[]) => void;
  getPresence: (userId: string) => UserPresence | undefined;
  isOnline: (userId: string) => boolean;
  clearPresence: () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  presenceMap: new Map(),

  setPresence: (userId, status, lastSeen) => {
    set((state) => {
      const newMap = new Map(state.presenceMap);
      newMap.set(userId, { userId, status, lastSeen });
      return { presenceMap: newMap };
    });
  },

  setPresenceBulk: (presences) => {
    set((state) => {
      const newMap = new Map(state.presenceMap);
      presences.forEach((p) => {
        newMap.set(p.userId, p);
      });
      return { presenceMap: newMap };
    });
  },

  getPresence: (userId) => {
    return get().presenceMap.get(userId);
  },

  isOnline: (userId) => {
    const presence = get().presenceMap.get(userId);
    return presence?.status === 'online';
  },

  clearPresence: () => {
    set({ presenceMap: new Map() });
  },
}));
