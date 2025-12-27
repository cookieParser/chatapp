"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage, Button, Input, ScrollArea } from "@/components/ui";
import { Phone, Video, MoreVertical, Paperclip, Smile, Send } from "lucide-react";
import { useState } from "react";

interface Message {
  id: string;
  content: string;
  timestamp: string;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
  isOwn?: boolean;
}

const mockMessages: Message[] = [
  {
    id: "1",
    content: "Hey! How's the project going?",
    timestamp: "10:30 AM",
    sender: { id: "1", name: "Alice Johnson" },
  },
  {
    id: "2",
    content: "Going well! Just finished the authentication module.",
    timestamp: "10:32 AM",
    sender: { id: "me", name: "You" },
    isOwn: true,
  },
  {
    id: "3",
    content: "That's great! Can you walk me through the implementation?",
    timestamp: "10:33 AM",
    sender: { id: "1", name: "Alice Johnson" },
  },
  {
    id: "4",
    content: "Sure! I used JWT tokens with refresh token rotation. The access tokens expire in 15 minutes and refresh tokens in 7 days.",
    timestamp: "10:35 AM",
    sender: { id: "me", name: "You" },
    isOwn: true,
  },
  {
    id: "5",
    content: "Perfect. What about the password hashing?",
    timestamp: "10:36 AM",
    sender: { id: "1", name: "Alice Johnson" },
  },
  {
    id: "6",
    content: "Using bcrypt with a cost factor of 12. Also added rate limiting on the login endpoint.",
    timestamp: "10:38 AM",
    sender: { id: "me", name: "You" },
    isOwn: true,
  },
];

interface ChatWindowProps {
  className?: string;
  chatId?: string;
}

export function ChatWindow({ className, chatId }: ChatWindowProps) {
  const [message, setMessage] = useState("");

  if (!chatId) {
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
            <AvatarImage src="" alt="Alice Johnson" />
            <AvatarFallback className="bg-primary/10 text-primary">
              AJ
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-foreground">Alice Johnson</h2>
            <p className="text-xs text-green-500">Online</p>
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

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          {mockMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <footer className="border-t border-border p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <Paperclip className="h-4 w-4" />
          </Button>
          <div className="relative flex-1">
            <Input
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
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
          <Button size="icon" className="h-9 w-9 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div
      className={cn(
        "flex gap-3",
        message.isOwn && "flex-row-reverse"
      )}
    >
      {!message.isOwn && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={message.sender.avatar} alt={message.sender.name} />
          <AvatarFallback className="bg-primary/10 text-xs text-primary">
            {message.sender.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "flex max-w-[70%] flex-col gap-1",
          message.isOwn && "items-end"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2",
            message.isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          <p className="text-sm">{message.content}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {message.timestamp}
        </span>
      </div>
    </div>
  );
}
