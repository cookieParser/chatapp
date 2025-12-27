import { ChatSidebar, MultiChatContainer } from '@/components/chat';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <MultiChatContainer />
      </main>
    </div>
  );
}
