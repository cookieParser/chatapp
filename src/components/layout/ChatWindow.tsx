"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage, Button, Input } from "@/components/ui";
import { Phone, Video, MoreVertical, Paperclip, Smile, Send } from "lucide-react";
import { VirtualizedMessageList } from "@/components/chat/VirtualizedMessageList";
import { useOptimisticMessages } from "@/hooks/useOptimisticMessages";
import { useMessageStore } from "@/store";
import { OptimisticMessage } from "@/store";

// Mock current user - replace with actual auth
const CURRENT_USER = {
  id: "me",
  name: "You",
  image: undefined,
};

// Mock chat data - replace with actual data fetching
const MOCK_CHATS: Record<string, { name: string; avatar?: string; online: boolean }> = {
  "1": { name: "Alice Johnson", online: true },
  "2": { name: "Bob Smith", online: true },
  "3": { name: "Team Chat", online: false },
  "4": { name: "David Lee", online: false },
  "5": { name: "Eve Wilson", online: false },
};

// Generate mock messages for demo - memoized outside component
const mockMessagesCache = new Map<string, OptimisticMessage[]>();

function getMockMessages(chatId: string): OptimisticMessage[] {
  if (mockMessagesCache.has(chatId)) {
    return mockMessagesCache.get(chatId)!;
  }

  const chat = MOCK_CHATS[chatId];
  if (!chat) return [];

  const messages: OptimisticMessage[] = [];
  const baseTime = Date.now() - 3600000;

  const conversations = [
    { content: "Hey! How's the project going?", isOwn: false },
    { content: "Going well! Just finished the authentication module.", isOwn: true },
    { content: "That's great! Can you walk me through the implementation?", isOwn: false },
    { content: "Sure! I used JWT tokens with refresh token rotation. The access tokens expire in 15 minutes and refresh tokens in 7 days.", isOwn: true },
    { content: "Perfect. What about the password hashing?", isOwn: false },
    { content: "Using bcrypt with a cost factor of 12. Also added rate limiting on the login endpoint.", isOwn: true },
    { content: "Excellent work! Let's discuss the database schema next.", isOwn: false },
    { content: "I've set up MongoDB with proper indexes. Want me to share the schema?", isOwn: true },
    { content: "Yes please, that would be helpful.", isOwn: false },
    { content: "I'll send it over in a bit. Also implemented connection pooling for better performance.", isOwn: true },
  ];

  conversations.forEach((msg, index) => {
    messages.push({
      _id: `${chatId}-msg-${index}`,
      tempId: `${chatId}-msg-${index}`,
      content: msg.content,
      sender: msg.isOwn
        ? { _id: CURRENT_USER.id, name: CURRENT_USER.name, image: CURRENT_USER.image }
        : { _id: chatId, name: chat.name, image: chat.avatar },
      createdAt: new Date(baseTime + index * 120000).toISOString(),
      type: "text",
      status: "read",
    });
  });

  mockMessagesCache.set(chatId, messages);
  return messages;
}

interface ChatWindowProps {
  className?: string;
  chatId?: string;
}

export function ChatWindow({ className, chatId }: ChatWindowProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef<Set<string>>(new Set());
  
  const { setMessages, messagesByConversation } = useMessageStore();

  // Simulate sending message to server
  const handleServerSend = useCallback(async (data: { tempId: string; content: string; conversationId: string }) => {
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
    if (Math.random() < 0.1) {
      throw new Error("Network error");
    }
    return { _id: `server-${Date.now()}` };
  }, []);

  const { sendMessage, retry, cancel } = useOptimisticMessages({
    onSend: handleServerSend,
  });

  // Load mock messages only once per chat
  useEffect(() => {
    if (chatId && !initializedRef.current.has(chatId)) {
      initializedRef.current.add(chatId);
      const mockMessages = getMockMessages(chatId);
      setMessages(chatId, mockMessages);
    }
  }, [chatId, setMessages]);

  // Get messages from store
  const messages = useMemo(() => {
    return chatId ? (messagesByConversation[chatId] || []) : [];
  }, [chatId, messagesByConversation]);

  const chat = chatId ? MOCK_CHATS[chatId] : null;

  const handleSend = useCallback(() => {
    if (!message.trim() || !chatId) return;

    sendMessage({
      conversationId: chatId,
      content: message.trim(),
      senderId: CURRENT_USER.id,
      senderName: CURRENT_USER.name,
      senderImage: CURRENT_USER.image,
    });

    setMessage("");
    inputRef.current?.focus();
  }, [message, chatId, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleRetry = useCallback((tempId: string) => {
    if (chatId) {
      retry(chatId, tempId);
    }
  }, [chatId, retry]);

  const handleCancel = useCallback((tempId: string) => {
    if (chatId) {
      cancel(chatId, tempId);
    }
  }, [chatId, cancel]);

  if (!chatId || !chat) {
    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center bg-background",
          className
        )}
      >
        <div className="text-center">
          <h3 className="text-lg font-medium text-foreground">
            Select a conversation
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a chat from the list to start messaging
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-1 flex-col bg-background", className)}>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={chat.avatar} alt={chat.name} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {chat.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-foreground">{chat.name}</h2>
            <p className={cn("text-xs", chat.online ? "text-green-500" : "text-muted-foreground")}>
              {chat.online ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Virtualized Messages */}
      <VirtualizedMessageList
        messages={messages}
        currentUserId={CURRENT_USER.id}
        onRetry={handleRetry}
        onCancel={handleCancel}
        className="flex-1"
      />

      {/* Input */}
      <footer className="border-t border-border p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <Paperclip className="h-4 w-4" />
          </Button>
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pr-10"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            >
              <Smile className="h-4 w-4" />
            </Button>
          </div>
          <Button 
            size="icon" 
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={!message.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
