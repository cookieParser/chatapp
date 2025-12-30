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
      {/* Tabs - hidden on mobile */}
      <div className="hidden md:block">
        <ChatTabs />
      </div>

      {/* Active Chat */}
      <div className="flex-1 overflow-hidden">
        {activeChat ? (
          <ChatRoom
            key={activeChat.id}
            conversationId={activeChat.id}
            conversationName={activeChat.name}
            conversationType={activeChat.type}
            otherUserId={activeChat.type === 'direct' ? activeChat.participantId : undefined}
          />
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4 sm:mb-6">
              <MessageCircle className="h-10 w-10 sm:h-12 sm:w-12 text-gray-600" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">
              Welcome to ChatApp
            </h2>
            <p className="text-gray-400 max-w-md text-sm sm:text-base">
              Select a conversation from the sidebar to start chatting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
