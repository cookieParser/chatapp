'use client';

import { ChatSidebar, MultiChatContainer } from '@/components/chat';
import { useChatStore } from '@/store/chatStore';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { activeTabId } = useChatStore();
  const hasActiveChat = !!activeTabId;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Sidebar - Full width on mobile when no chat is open, fixed width on desktop */}
      <div className={`${hasActiveChat ? 'hidden md:flex' : 'flex'} w-full md:w-72 lg:w-80 flex-shrink-0`}>
        <ChatSidebar />
      </div>

      {/* Main Chat Area - Full width on mobile when chat is open */}
      <main className={`${hasActiveChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-hidden min-w-0`}>
        <MultiChatContainer />
      </main>
    </div>
  );
}
