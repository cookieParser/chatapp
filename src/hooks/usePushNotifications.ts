/**
 * Push Notifications Hook
 * 
 * Handles push notification subscription and permission management.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';

interface UsePushNotificationsOptions {
  userId?: string;
  enabled?: boolean;
}

type PermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

interface VapidKeyResponse {
  vapidPublicKey: string;
}

interface SubscribeResponse {
  success: boolean;
}

export function usePushNotifications({ userId, enabled = true }: UsePushNotificationsOptions = {}) {
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if push is supported
  const isSupported = typeof window !== 'undefined' && 
    'serviceWorker' in navigator && 
    'PushManager' in window;

  // Check current permission and subscription status
  useEffect(() => {
    if (!isSupported) {
      setPermission('unsupported');
      return;
    }

    // Check notification permission
    setPermission(Notification.permission as PermissionState);

    // Check if already subscribed
    const checkSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } catch (err) {
        console.error('Failed to check push subscription:', err);
      }
    };

    checkSubscription();
  }, [isSupported]);

  /**
   * Request notification permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      return result === 'granted';
    } catch (err) {
      console.error('Failed to request notification permission:', err);
      return false;
    }
  }, [isSupported]);

  /**
   * Subscribe to push notifications
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !enabled) return false;

    setIsLoading(true);
    setError(null);

    try {
      // Request permission if not granted
      if (Notification.permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          setError('Notification permission denied');
          return false;
        }
      }

      // Get VAPID public key from server
      const keyResponse = await api.get<VapidKeyResponse>(
        '/notifications/push/subscribe'
      );

      if (!keyResponse?.vapidPublicKey) {
        setError('Push notifications not configured on server');
        return false;
      }

      // Convert VAPID key to Uint8Array
      const vapidPublicKey = urlBase64ToUint8Array(keyResponse.vapidPublicKey);

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey as BufferSource,
      });

      // Send subscription to server
      const response = await api.post<SubscribeResponse>(
        '/notifications/push/subscribe', 
        subscription.toJSON()
      );

      if (response?.success) {
        setIsSubscribed(true);
        return true;
      } else {
        throw new Error('Failed to save subscription');
      }
    } catch (err) {
      console.error('Push subscription failed:', err);
      setError(err instanceof Error ? err.message : 'Subscription failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, enabled, requestPermission]);

  /**
   * Unsubscribe from push notifications
   */
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe locally
        await subscription.unsubscribe();

        // Remove from server
        await api.post('/notifications/push/unsubscribe', {
          endpoint: subscription.endpoint,
        });
      }

      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('Push unsubscription failed:', err);
      setError(err instanceof Error ? err.message : 'Unsubscription failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  /**
   * Auto-subscribe on mount if permission already granted
   */
  useEffect(() => {
    if (!enabled || !isSupported) return;
    if (permission === 'granted' && !isSubscribed && !isLoading) {
      subscribe();
    }
  }, [enabled, isSupported, permission, isSubscribed, isLoading, subscribe]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}

/**
 * Convert base64 VAPID key to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
