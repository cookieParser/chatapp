'use client';

import { X, Hash, Users, MessageCircle } from 'lucide-react';
import { useChatStore, ChatTab } from '@/store/chatStore';
import { useNotificationStore } from '@/store/notificationStore';
import { UnreadBadge } from '@/components/notifications';

export function ChatTabs() {
  const { activeTabs, activeTabId, setActiveTab, closeChat } = useChatStore();
  const { unreadCounts } = useNotificationStore();

  if (activeTabs.length === 0) return null;

  const getIcon = (type: ChatTab['type']) => {
    switch (type) {
      case 'channel':
        return <Hash className="h-4 w-4" />;
      case 'group':
        return <Users className="h-4 w-4" />;
      case 'direct':
        return <MessageCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-900 border-b border-gray-800 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700">
      {activeTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const unreadCount = unreadCounts.get(tab.id) || 0;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all min-w-0 max-w-[200px] ${
              isActive
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <span className="flex-shrink-0 text-gray-500">
              {getIcon(tab.type)}
            </span>
            <span className="truncate">{tab.name}</span>
            {unreadCount > 0 && !isActive && (
              <UnreadBadge count={unreadCount} size="sm" />
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeChat(tab.id);
              }}
              className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-700 transition-all"
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
