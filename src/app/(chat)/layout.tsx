'use client';

import { ChatSidebar, MultiChatContainer } from '@/components/chat';
import { useChatStore } from '@/store/chatStore';
import { X } from 'lucide-react';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { isMobileSidebarOpen, setMobileSidebarOpen } = useChatStore();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <ChatSidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-80 transform transition-transform duration-300 ease-in-out md:hidden ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <ChatSidebar />
        <button
          onClick={() => setMobileSidebarOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-full bg-gray-800 text-gray-400 hover:text-white md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Content */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <MultiChatContainer />
      </main>
    </div>
  );
}
