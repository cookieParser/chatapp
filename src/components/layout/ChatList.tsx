"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage, ScrollArea, Button, Input } from "@/components/ui";
import { Search, Plus } from "lucide-react";

interface Chat {
  id: string;
  name: string;
  avatar?: string;
  lastMessage: string;
  timestamp: string;
  unread?: number;
  online?: boolean;
}

const mockChats: Chat[] = [
  {
    id: "1",
    name: "Alice Johnson",
    lastMessage: "Hey, how's the project going?",
    timestamp: "2m",
    unread: 3,
    online: true,
  },
  {
    id: "2",
    name: "Bob Smith",
    lastMessage: "The meeting is at 3pm",
    timestamp: "15m",
    online: true,
  },
  {
    id: "3",
    name: "Team Chat",
    lastMessage: "Carol: I'll review the PR today",
    timestamp: "1h",
    unread: 1,
  },
  {
    id: "4",
    name: "David Lee",
    lastMessage: "Thanks for the help!",
    timestamp: "3h",
  },
  {
    id: "5",
    name: "Eve Wilson",
    lastMessage: "See you tomorrow",
    timestamp: "1d",
    online: false,
  },
];

interface ChatListProps {
  className?: string;
  selectedChatId?: string;
  onSelectChat?: (chatId: string) => void;
}

export function ChatList({ className, selectedChatId, onSelectChat }: ChatListProps) {
  return (
    <div
      className={cn(
        "flex h-full w-72 flex-col border-r border-border bg-card",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-lg font-semibold text-card-foreground">Messages</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="pl-9 bg-muted/50"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {mockChats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              selected={selectedChatId === chat.id}
              onClick={() => onSelectChat?.(chat.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ChatListItemProps {
  chat: Chat;
  selected?: boolean;
  onClick?: () => void;
}

function ChatListItem({ chat, selected, onClick }: ChatListItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent",
        selected && "bg-accent"
      )}
    >
      <div className="relative">
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
        {chat.online && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="font-medium text-card-foreground">{chat.name}</span>
          <span className="text-xs text-muted-foreground">{chat.timestamp}</span>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {chat.lastMessage}
        </p>
      </div>

      {chat.unread && chat.unread > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
          {chat.unread}
        </span>
      )}
    </button>
  );
}
