'use client';

import { Bell, BellOff, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { MuteButton } from '@/components/notifications';

interface ChatHeaderProps {
  conversationId?: string;
  name?: string;
  memberCount?: number;
}

export function ChatHeader({ conversationId, name = '# general', memberCount = 3 }: ChatHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{name}</h1>
        <p className="text-sm text-gray-500">{memberCount} member{memberCount !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex items-center gap-2">
        {conversationId && (
          <MuteButton conversationId={conversationId} />
        )}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
