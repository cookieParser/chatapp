'use client';

import { useEffect, useCallback, useRef } from 'react';
import { usePresenceStore, UserPresence } from '@/store/presenceStore';

interface UsePresenceOptions {
  userIds: string[];
  onPresenceUpdate?: (presence: UserPresence) => void;
}

interface UsePresenceReturn {
  getPresence: (userId: string) => UserPresence | undefined;
  isOnline: (userId: string) => boolean;
  subscribeToUsers: (userIds: string[]) => void;
  unsubscribeFromUsers: (userIds: string[]) => void;
}

// Socket reference will be set by useSocket
let socketRef: { current: any } = { current: null };

export function setPresenceSocket(socket: any) {
  socketRef.current = socket;
}

export function usePresence(options: UsePresenceOptions): UsePresenceReturn {
  const { userIds, onPresenceUpdate } = options;
  const { setPresence, setPresenceBulk, getPresence, isOnline } = usePresenceStore();
  const subscribedRef = useRef<Set<string>>(new Set());

  const subscribeToUsers = useCallback((ids: string[]) => {
    if (socketRef.current?.connected && ids.length > 0) {
      socketRef.current.emit('presence:subscribe', ids);
      ids.forEach(id => subscribedRef.current.add(id));
    }
  }, []);

  const unsubscribeFromUsers = useCallback((ids: string[]) => {
    if (socketRef.current?.connected && ids.length > 0) {
      socketRef.current.emit('presence:unsubscribe', ids);
      ids.forEach(id => subscribedRef.current.delete(id));
    }
  }, []);

  useEffect(() => {
    if (!socketRef.current) return;

    const handlePresenceUpdate = (data: { userId: string; status: string; lastSeen: string }) => {
      const presence: UserPresence = {
        userId: data.userId,
        status: data.status as UserPresence['status'],
        lastSeen: new Date(data.lastSeen),
      };
      setPresence(data.userId, presence.status, presence.lastSeen);
      onPresenceUpdate?.(presence);
    };

    const handlePresenceBulk = (data: Array<{ userId: string; status: string; lastSeen: string }>) => {
      const presences: UserPresence[] = data.map(d => ({
        userId: d.userId,
        status: d.status as UserPresence['status'],
        lastSeen: new Date(d.lastSeen),
      }));
      setPresenceBulk(presences);
    };

    const handleUserOnline = (userId: string) => {
      setPresence(userId, 'online', new Date());
    };

    const handleUserOffline = (userId: string) => {
      setPresence(userId, 'offline', new Date());
    };

    socketRef.current.on('presence:update', handlePresenceUpdate);
    socketRef.current.on('presence:bulk', handlePresenceBulk);
    socketRef.current.on('user:online', handleUserOnline);
    socketRef.current.on('user:offline', handleUserOffline);

    // Subscribe to initial user IDs
    if (userIds.length > 0) {
      subscribeToUsers(userIds);
    }

    return () => {
      socketRef.current?.off('presence:update', handlePresenceUpdate);
      socketRef.current?.off('presence:bulk', handlePresenceBulk);
      socketRef.current?.off('user:online', handleUserOnline);
      socketRef.current?.off('user:offline', handleUserOffline);
      
      // Unsubscribe from all users
      if (subscribedRef.current.size > 0) {
        unsubscribeFromUsers(Array.from(subscribedRef.current));
      }
    };
  }, [userIds, setPresence, setPresenceBulk, onPresenceUpdate, subscribeToUsers, unsubscribeFromUsers]);

  return {
    getPresence,
    isOnline,
    subscribeToUsers,
    unsubscribeFromUsers,
  };
}
