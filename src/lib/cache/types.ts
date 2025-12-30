/**
 * Cache Types
 */

export interface CachedParticipant {
  id: string;
  name: string;
  email: string;
  image?: string;
  status: string;
}

export interface CachedLastMessage {
  content: string;
  type: string;
  senderName?: string;
  createdAt: string;
}

export interface CachedChatItem {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  image?: string;
  participants: CachedParticipant[];
  lastMessage: CachedLastMessage | null;
  lastMessageAt?: string;
  createdAt: string;
  unreadCount: number;
}

export interface CachedChatList {
  userId: string;
  chats: CachedChatItem[];
  cachedAt: number;
}

export interface CacheConfig {
  ttlMs: number;           // Time-to-live in milliseconds
  maxEntries?: number;     // Max entries for in-memory cache
}

export interface CacheStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  deletePattern(pattern: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}
