'use client';

import { useChatStore } from '@/store/chatStore';
import { ChatRoom } from './ChatRoom';
import { ChatTabs } from './ChatTabs';
import { MessageCircle, Menu } from 'lucide-react';

export function MultiChatContainer() {
  const { activeTabs, activeTabId, toggleMobileSidebar } = useChatStore();

  const activeChat = activeTabs.find(t => t.id === activeTabId);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Mobile Header with Menu Button */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 md:hidden">
        <button
          onClick={toggleMobileSidebar}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          ChatApp
        </h1>
      </div>

      {/* Tabs */}
      <ChatTabs />

      {/* Active Chat */}
      <div className="flex-1 overflow-hidden">
        {activeChat ? (
          <ChatRoom
            key={activeChat.id}
            conversationId={activeChat.id}
            conversationName={activeChat.name}
            conversationType={activeChat.type}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4 sm:mb-6">
              <MessageCircle className="h-10 w-10 sm:h-12 sm:w-12 text-gray-600" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">
              Welcome to ChatApp
            </h2>
            <p className="text-gray-400 max-w-md text-sm sm:text-base">
              Select a conversation from the sidebar to start chatting, or create a new group to connect with others.
            </p>
            <button
              onClick={toggleMobileSidebar}
              className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors md:hidden"
            >
              Open Chats
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
