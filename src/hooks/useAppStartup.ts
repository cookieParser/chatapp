/**
 * App Startup Hook
 * 
 * Ensures zero visible loading on app open:
 * 1. Load UI from IndexedDB immediately
 * 2. Register service worker
 * 3. Subscribe to push notifications
 * 4. Connect socket (if visible)
 * 5. Background sync with server
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Workbox } from 'workbox-window';
import {
  getConversations,
  getSyncMetadata,
  performInitialSync,
  performDeltaSync,
  clearAllData,
} from '@/lib/offline';
import { usePushNotifications } from './usePushNotifications';

interface UseAppStartupOptions {
  userId: string;
  enabled?: boolean;
}

interface StartupState {
  isReady: boolean;
  hasLocalData: boolean;
  isSyncing: boolean;
  serviceWorkerReady: boolean;
  pushEnabled: boolean;
  error: string | null;
}

export function useAppStartup({ userId, enabled = true }: UseAppStartupOptions) {
  const [state, setState] = useState<StartupState>({
    isReady: false,
    hasLocalData: false,
    isSyncing: false,
    serviceWorkerReady: false,
    pushEnabled: false,
    error: null,
  });

  const initRef = useRef(false);
  const workboxRef = useRef<Workbox | null>(null);

  // Push notifications
  const { isSubscribed: pushEnabled, subscribe: subscribePush } = usePushNotifications({
    userId,
    enabled,
  });

  /**
   * Register service worker
   */
  const registerServiceWorker = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return false;
    }

    try {
      // Use Workbox for better SW management
      const wb = new Workbox('/sw.js');
      workboxRef.current = wb;

      // Handle updates
      wb.addEventListener('waiting', () => {
        console.log('[SW] New version available');
        // Optionally prompt user to refresh
      });

      wb.addEventListener('controlling', () => {
        console.log('[SW] New version activated');
      });

      await wb.register();
      console.log('[SW] Registered successfully');
      return true;
    } catch (error) {
      console.error('[SW] Registration failed:', error);
      return false;
    }
  }, []);

  /**
   * Check for local data
   */
  const checkLocalData = useCallback(async () => {
    try {
      const conversations = await getConversations();
      return conversations.length > 0;
    } catch {
      return false;
    }
  }, []);

  /**
   * Perform initial or delta sync
   */
  const syncData = useCallback(async () => {
    if (!userId) return;

    setState(s => ({ ...s, isSyncing: true }));

    try {
      const syncMeta = await getSyncMetadata('global');
      
      if (!syncMeta || syncMeta.lastSyncTimestamp === 0) {
        // First time - do initial sync
        console.log('[Startup] Performing initial sync...');
        await performInitialSync(userId);
      } else {
        // Delta sync
        console.log('[Startup] Performing delta sync...');
        await performDeltaSync(userId);
      }
    } catch (error) {
      console.error('[Startup] Sync failed:', error);
      setState(s => ({ ...s, error: 'Failed to sync data' }));
    } finally {
      setState(s => ({ ...s, isSyncing: false }));
    }
  }, [userId]);

  /**
   * Main startup sequence
   */
  useEffect(() => {
    if (!enabled || !userId || initRef.current) return;
    initRef.current = true;

    const startup = async () => {
      console.log('[Startup] Beginning startup sequence...');

      // Step 1: Check for local data (instant)
      const hasLocal = await checkLocalData();
      setState(s => ({ ...s, hasLocalData: hasLocal }));

      if (hasLocal) {
        // We have local data - mark as ready immediately
        setState(s => ({ ...s, isReady: true }));
        console.log('[Startup] Local data found - UI ready');
      }

      // Step 2: Register service worker (parallel)
      const swReady = await registerServiceWorker();
      setState(s => ({ ...s, serviceWorkerReady: swReady }));

      // Step 3: Background sync (non-blocking)
      syncData().then(() => {
        // If we didn't have local data, mark ready after sync
        if (!hasLocal) {
          setState(s => ({ ...s, isReady: true, hasLocalData: true }));
        }
      });

      // Step 4: Subscribe to push (non-blocking)
      if (swReady) {
        subscribePush().catch(console.error);
      }

      console.log('[Startup] Startup sequence complete');
    };

    startup();
  }, [enabled, userId, checkLocalData, registerServiceWorker, syncData, subscribePush]);

  // Update push state
  useEffect(() => {
    setState(s => ({ ...s, pushEnabled }));
  }, [pushEnabled]);

  /**
   * Force refresh - clear local data and resync
   */
  const forceRefresh = useCallback(async () => {
    setState(s => ({ ...s, isSyncing: true, error: null }));

    try {
      await clearAllData();
      await performInitialSync(userId);
      
      const conversations = await getConversations();
      setState(s => ({
        ...s,
        hasLocalData: conversations.length > 0,
        isSyncing: false,
      }));
    } catch (error) {
      console.error('[Startup] Force refresh failed:', error);
      setState(s => ({
        ...s,
        isSyncing: false,
        error: 'Failed to refresh data',
      }));
    }
  }, [userId]);

  /**
   * Trigger service worker update
   */
  const updateServiceWorker = useCallback(() => {
    if (workboxRef.current) {
      workboxRef.current.messageSkipWaiting();
    }
  }, []);

  return {
    ...state,
    forceRefresh,
    updateServiceWorker,
  };
}

/**
 * Hook for app shell loading state
 * Returns true immediately if we have cached data
 */
export function useInstantLoad(userId: string) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // Check IndexedDB for cached data
    const checkCache = async () => {
      try {
        const conversations = await getConversations();
        if (conversations.length > 0) {
          setIsReady(true);
          return;
        }
      } catch {
        // Ignore errors
      }

      // No cache - wait for network
      // This will be handled by the loading state
    };

    checkCache();
  }, [userId]);

  return isReady;
}
