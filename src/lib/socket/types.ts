import { IMessage } from '@/lib/db/models';

// Socket event types
export type SocketEventType =
  | 'message:send'
  | 'message:new'
  | 'message:delivered'
  | 'message:read'
  | 'message:delivered:batch'
  | 'message:read:batch'
  | 'typing:start'
  | 'typing:stop'
  | 'user:online'
  | 'user:offline'
  | 'conversation:join'
  | 'conversation:leave'
  | 'presence:subscribe'
  | 'presence:unsubscribe'
  | 'presence:update';

// Client to Server events
export interface ClientToServerEvents {
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
  'message:send': (data: SendMessagePayload, callback: (response: MessageResponse) => void) => void;
  'message:delivered': (data: MessageStatusPayload) => void;
  'message:read': (data: MessageStatusPayload) => void;
  'message:delivered:batch': (data: BatchMessageStatusPayload) => void;
  'message:read:batch': (data: BatchMessageStatusPayload) => void;
  'typing:start': (conversationId: string) => void;
  'typing:stop': (conversationId: string) => void;
  'presence:subscribe': (userIds: string[]) => void;
  'presence:unsubscribe': (userIds: string[]) => void;
}

// Server to Client events
export interface ServerToClientEvents {
  'message:new': (message: MessagePayload) => void;
  'message:delivered': (data: MessageStatusPayload) => void;
  'message:read': (data: MessageStatusPayload) => void;
  'message:delivered:batch': (data: BatchStatusUpdatePayload) => void;
  'message:read:batch': (data: BatchStatusUpdatePayload) => void;
  'typing:start': (data: TypingPayload) => void;
  'typing:stop': (data: TypingPayload) => void;
  'typing:update': (data: TypingUpdatePayload) => void;
  'user:online': (userId: string) => void;
  'user:offline': (userId: string) => void;
  'presence:update': (data: PresencePayload) => void;
  'presence:bulk': (data: PresencePayload[]) => void;
  error: (error: SocketError) => void;
}

// Inter-server events (for scaling)
export interface InterServerEvents {
  ping: () => void;
}

// Socket data attached to each connection
export interface SocketData {
  userId: string;
  username: string;
}

// Payload types
export interface SendMessagePayload {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
  replyToId?: string;
}

export interface MessagePayload {
  _id: string;
  conversation: string;
  sender: {
    _id: string;
    username: string;
    image?: string;
  };
  content: string;
  type: string;
  createdAt: string;
  replyTo?: string;
}

export interface MessageResponse {
  success: boolean;
  message?: MessagePayload;
  error?: string;
}

export interface MessageStatusPayload {
  messageId: string;
  conversationId: string;
  userId: string;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  username: string;
}

export interface TypingUpdatePayload {
  conversationId: string;
  users: Array<{ userId: string; username: string }>;
}

export interface BatchMessageStatusPayload {
  conversationId: string;
  messageIds: string[];
  userId: string;
}

export interface BatchStatusUpdatePayload {
  conversationId: string;
  messageIds: string[];
  userId: string;
  username?: string;
}

export interface SocketError {
  message: string;
  code?: string;
}

export type UserStatus = 'online' | 'offline' | 'away';

export interface PresencePayload {
  userId: string;
  status: UserStatus;
  lastSeen: string;
}
