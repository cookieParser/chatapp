import { create } from 'zustand';

/**
 * Minimal user info cached for socket message display
 * Avoids sending full profile data in socket events
 */
export interface CachedUser {
  _id: string;
  username?: string;
  name?: string;
  image?: string;
}

interface UserCacheState {
  users: Map<string, CachedUser>;
  getUser: (userId: string) => CachedUser | undefined;
  setUser: (user: CachedUser) => void;
  setUsers: (users: CachedUser[]) => void;
  fetchUser: (userId: string) => Promise<CachedUser | undefined>;
}

export const useUserCacheStore = create<UserCacheState>((set, get) => ({
  users: new Map(),

  getUser: (userId: string) => {
    return get().users.get(userId);
  },

  setUser: (user: CachedUser) => {
    set((state) => {
      const newUsers = new Map(state.users);
      newUsers.set(user._id, user);
      return { users: newUsers };
    });
  },

  setUsers: (users: CachedUser[]) => {
    set((state) => {
      const newUsers = new Map(state.users);
      users.forEach((user) => newUsers.set(user._id, user));
      return { users: newUsers };
    });
  },

  fetchUser: async (userId: string) => {
    // Check cache first
    const cached = get().users.get(userId);
    if (cached) return cached;

    try {
      const res = await fetch(`/api/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        const user: CachedUser = {
          _id: data.id || data._id,
          username: data.username,
          name: data.name,
          image: data.image,
        };
        get().setUser(user);
        return user;
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
    return undefined;
  },
}));
