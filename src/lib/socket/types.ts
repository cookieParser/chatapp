import { IMessage } from '@/lib/db/models';

// Socket event types
export type SocketEventType =
  | 'message:send'
  | 'message:new'
  | 'message:delete'
  | 'message:deleted'
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
  'message:delete': (data: DeleteMessagePayload, callback: (response: DeleteMessageResponse) => void) => void;
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
  'message:new': (message: MinimalMessagePayload) => void;
  'message:deleted': (data: MessageDeletedPayload) => void;
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

/**
 * Minimal message payload for socket broadcasts
 * Only contains essential fields to reduce bandwidth
 * Clients should fetch user profile data separately if needed
 */
export interface MinimalMessagePayload {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  type?: string;
  replyToId?: string;
}

/**
 * Full message payload - used only for sender callback response
 * Contains complete message data including sender profile
 */
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
  replyToMessage?: {
    _id: string;
    content: string;
    sender: {
      _id: string;
      username: string;
    };
    isDeleted?: boolean;
  };
}

export interface DeleteMessagePayload {
  messageId: string;
  conversationId: string;
}

export interface DeleteMessageResponse {
  success: boolean;
  error?: string;
}

export interface MessageDeletedPayload {
  messageId: string;
  conversationId: string;
  deletedBy: string;
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
