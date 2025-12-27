'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, X } from 'lucide-react';

export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    // Small delay to let the page settle after any redirects
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      
      // Check all conditions
      const wasDismissed = localStorage.getItem('notification-banner-dismissed') === 'true';
      const notificationsSupported = 'Notification' in window;
      const permissionIsDefault = notificationsSupported && Notification.permission === 'default';
      
      if (!wasDismissed && permissionIsDefault) {
        setVisible(true);
      }
    }, 500);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem('notification-banner-dismissed', 'true');
  }, []);

  const handleEnable = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      setVisible(false);
      if (permission === 'granted') {
        localStorage.setItem('notification-banner-dismissed', 'true');
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      setVisible(false);
    }
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-white" />
          <p className="text-sm text-white">
            Enable notifications to stay updated on new messages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnable}
            className="px-4 py-1.5 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Enable
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-white/80 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
