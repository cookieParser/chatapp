'use client';

import { useChatStore } from '@/store/chatStore';
import { ChatRoom } from './ChatRoom';
import { ChatTabs } from './ChatTabs';
import { MessageCircle } from 'lucide-react';

export function MultiChatContainer() {
  const { activeTabs, activeTabId } = useChatStore();

  const activeChat = activeTabs.find(t => t.id === activeTabId);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Tabs */}
      <ChatTabs />

      {/* Active Chat */}
      <div className="flex-1 overflow-hidden">
        {activeChat ? (
          <ChatRoom
            key={activeChat.id}
            channelId={activeChat.type === 'channel' ? activeChat.id : undefined}
            groupId={activeChat.type !== 'channel' ? activeChat.id : undefined}
            type={activeChat.type === 'channel' ? 'channel' : 'group'}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-6">
              <MessageCircle className="h-12 w-12 text-gray-600" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">
              Welcome to ChatApp
            </h2>
            <p className="text-gray-400 max-w-md">
              Select a conversation from the sidebar to start chatting, or create a new group to connect with others.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
