'use client';

import { useState } from 'react';
import { Bell, BellOff, Clock } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface MuteButtonProps {
  conversationId: string;
  className?: string;
  showLabel?: boolean;
}

const MUTE_DURATIONS = [
  { label: '1 hour', minutes: 60 },
  { label: '8 hours', minutes: 480 },
  { label: '24 hours', minutes: 1440 },
  { label: '7 days', minutes: 10080 },
  { label: 'Forever', minutes: undefined },
];

export function MuteButton({ conversationId, className, showLabel = false }: MuteButtonProps) {
  const { isConversationMuted, mute, unmute } = useNotifications();
  const [showMenu, setShowMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isMuted = isConversationMuted(conversationId);

  const handleToggle = async () => {
    if (isMuted) {
      setIsLoading(true);
      await unmute(conversationId);
      setIsLoading(false);
    } else {
      setShowMenu(true);
    }
  };

  const handleMute = async (duration?: number) => {
    setIsLoading(true);
    setShowMenu(false);
    await mute(conversationId, duration);
    setIsLoading(false);
  };

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
          isMuted
            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
          isLoading && 'opacity-50 cursor-not-allowed',
          className
        )}
        title={isMuted ? 'Unmute notifications' : 'Mute notifications'}
      >
        {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {showLabel && <span>{isMuted ? 'Unmute' : 'Mute'}</span>}
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg bg-gray-800 border border-gray-700 shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700">
              <p className="text-xs font-medium text-gray-400 uppercase">Mute for</p>
            </div>
            {MUTE_DURATIONS.map((option) => (
              <button
                key={option.label}
                onClick={() => handleMute(option.minutes)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                <Clock className="h-4 w-4 text-gray-500" />
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
