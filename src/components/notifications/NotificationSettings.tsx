'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Monitor } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { cn } from '@/lib/utils';

interface NotificationSettingsProps {
  className?: string;
}

export function NotificationSettings({ className }: NotificationSettingsProps) {
  const { soundEnabled, setSoundEnabled, pushPermission, requestPermission } = useNotifications();
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();
  const [desktopEnabled, setDesktopEnabled] = useState(false);

  useEffect(() => {
    setDesktopEnabled(pushPermission === 'granted');
  }, [pushPermission]);

  const handleDesktopToggle = async () => {
    if (desktopEnabled) {
      // Can't revoke permission programmatically, just inform user
      alert('To disable desktop notifications, please update your browser settings.');
    } else {
      const granted = await requestPermission();
      setDesktopEnabled(granted);
    }
  };

  const handlePushToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <h3 className="text-lg font-semibold text-white">Notification Settings</h3>

      <div className="space-y-3">
        {/* Sound notifications */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
          <div className="flex items-center gap-3">
            {soundEnabled ? (
              <Volume2 className="h-5 w-5 text-blue-400" />
            ) : (
              <VolumeX className="h-5 w-5 text-gray-500" />
            )}
            <div>
              <p className="text-sm font-medium text-white">Sound</p>
              <p className="text-xs text-gray-400">Play sound for new messages</p>
            </div>
          </div>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors',
              soundEnabled ? 'bg-blue-600' : 'bg-gray-600'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                soundEnabled ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        {/* Desktop notifications */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
          <div className="flex items-center gap-3">
            <Monitor className={cn('h-5 w-5', desktopEnabled ? 'text-blue-400' : 'text-gray-500')} />
            <div>
              <p className="text-sm font-medium text-white">Desktop Notifications</p>
              <p className="text-xs text-gray-400">Show notifications when tab is inactive</p>
            </div>
          </div>
          <button
            onClick={handleDesktopToggle}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors',
              desktopEnabled ? 'bg-blue-600' : 'bg-gray-600'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                desktopEnabled ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        {/* Push notifications */}
        {isSupported && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
            <div className="flex items-center gap-3">
              {isSubscribed ? (
                <Bell className="h-5 w-5 text-blue-400" />
              ) : (
                <BellOff className="h-5 w-5 text-gray-500" />
              )}
              <div>
                <p className="text-sm font-medium text-white">Push Notifications</p>
                <p className="text-xs text-gray-400">Receive notifications even when browser is closed</p>
              </div>
            </div>
            <button
              onClick={handlePushToggle}
              disabled={isLoading}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                isSubscribed ? 'bg-blue-600' : 'bg-gray-600',
                isLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                  isSubscribed ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
