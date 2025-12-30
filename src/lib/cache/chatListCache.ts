/**
 * Chat List Cache Service
 * 
 * Caches chat list data per user with automatic invalidation.
 * 
 * Cache Keys:
 * - chatlist:{userId} - Full chat list for a user
 * - unread:{userId}:{conversationId} - Unread count per conversation
 */

import {
  CacheStorage,
  CachedChatList,
  CachedChatItem,
  CachedLastMessage,
  CachedParticipant,
} from './types';
import { InMemoryCacheStorage } from './storage';

// Default TTL: 5 minutes
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// Singleton cache storage instance
let cacheStorage: CacheStorage | null = null;

/**
 * Initialize the cache with custom storage (e.g., Redis)
 */
export function initChatListCache(storage: CacheStorage): void {
  cacheStorage = storage;
}

/**
 * Get or create the cache storage instance
 */
function getStorage(): CacheStorage {
  if (!cacheStorage) {
    cacheStorage = new InMemoryCacheStorage({
      ttlMs: DEFAULT_TTL_MS,
      maxEntries: 5000,
    });
  }
  return cacheStorage;
}

/**
 * Cache key generators
 */
const cacheKeys = {
  chatList: (userId: string) => `chatlist:${userId}`,
  unreadCount: (userId: string, conversationId: string) => 
    `unread:${userId}:${conversationId}`,
  conversationParticipants: (conversationId: string) => 
    `participants:${conversationId}`,
};

/**
 * Get cached chat list for a user
 */
export async function getCachedChatList(
  userId: string
): Promise<CachedChatItem[] | null> {
  const storage = getStorage();
  const cached = await storage.get<CachedChatList>(cacheKeys.chatList(userId));
  
  if (!cached) return null;
  
  // Check if cache is still valid
  const age = Date.now() - cached.cachedAt;
  if (age > DEFAULT_TTL_MS) {
    await storage.delete(cacheKeys.chatList(userId));
    return null;
  }
  
  return cached.chats;
}

/**
 * Set cached chat list for a user
 */
export async function setCachedChatList(
  userId: string,
  chats: CachedChatItem[]
): Promise<void> {
  const storage = getStorage();
  const cacheData: CachedChatList = {
    userId,
    chats,
    cachedAt: Date.now(),
  };
  await storage.set(cacheKeys.chatList(userId), cacheData, DEFAULT_TTL_MS);
}


/**
 * Invalidate chat list cache for a user
 */
export async function invalidateChatListCache(userId: string): Promise<void> {
  const storage = getStorage();
  await storage.delete(cacheKeys.chatList(userId));
}

/**
 * Invalidate chat list cache for multiple users (e.g., all participants in a conversation)
 */
export async function invalidateChatListCacheForUsers(
  userIds: string[]
): Promise<void> {
  const storage = getStorage();
  await Promise.all(
    userIds.map((userId) => storage.delete(cacheKeys.chatList(userId)))
  );
}

/**
 * Invalidate all chat list caches (use sparingly)
 */
export async function invalidateAllChatListCaches(): Promise<void> {
  const storage = getStorage();
  await storage.deletePattern('chatlist:*');
}

/**
 * Update cached chat list with new message
 * This is more efficient than full invalidation for single message updates
 */
export async function updateCachedChatListWithMessage(
  userId: string,
  conversationId: string,
  lastMessage: CachedLastMessage
): Promise<void> {
  const storage = getStorage();
  const cached = await storage.get<CachedChatList>(cacheKeys.chatList(userId));
  
  if (!cached) return;
  
  const chatIndex = cached.chats.findIndex((c) => c.id === conversationId);
  if (chatIndex === -1) {
    // Conversation not in cache, invalidate to force refresh
    await invalidateChatListCache(userId);
    return;
  }
  
  // Update the chat item
  cached.chats[chatIndex] = {
    ...cached.chats[chatIndex],
    lastMessage,
    lastMessageAt: lastMessage.createdAt,
  };
  
  // Move to top of list (most recent)
  const [chat] = cached.chats.splice(chatIndex, 1);
  cached.chats.unshift(chat);
  
  // Update cache
  cached.cachedAt = Date.now();
  await storage.set(cacheKeys.chatList(userId), cached, DEFAULT_TTL_MS);
}

/**
 * Increment unread count for a user in a conversation
 */
export async function incrementUnreadCount(
  userId: string,
  conversationId: string
): Promise<void> {
  const storage = getStorage();
  const cached = await storage.get<CachedChatList>(cacheKeys.chatList(userId));
  
  if (!cached) return;
  
  const chat = cached.chats.find((c) => c.id === conversationId);
  if (chat) {
    chat.unreadCount = (chat.unreadCount || 0) + 1;
    cached.cachedAt = Date.now();
    await storage.set(cacheKeys.chatList(userId), cached, DEFAULT_TTL_MS);
  }
}

/**
 * Reset unread count for a user in a conversation (when messages are read)
 */
export async function resetUnreadCount(
  userId: string,
  conversationId: string
): Promise<void> {
  const storage = getStorage();
  const cached = await storage.get<CachedChatList>(cacheKeys.chatList(userId));
  
  if (!cached) return;
  
  const chat = cached.chats.find((c) => c.id === conversationId);
  if (chat && chat.unreadCount > 0) {
    chat.unreadCount = 0;
    cached.cachedAt = Date.now();
    await storage.set(cacheKeys.chatList(userId), cached, DEFAULT_TTL_MS);
  }
}

/**
 * Cache participant info for a conversation
 */
export async function cacheConversationParticipants(
  conversationId: string,
  participants: CachedParticipant[]
): Promise<void> {
  const storage = getStorage();
  await storage.set(
    cacheKeys.conversationParticipants(conversationId),
    participants,
    DEFAULT_TTL_MS * 2 // Longer TTL for participant info
  );
}

/**
 * Get cached participant info for a conversation
 */
export async function getCachedConversationParticipants(
  conversationId: string
): Promise<CachedParticipant[] | null> {
  const storage = getStorage();
  return storage.get<CachedParticipant[]>(
    cacheKeys.conversationParticipants(conversationId)
  );
}

/**
 * Invalidate participant cache for a conversation
 */
export async function invalidateConversationParticipants(
  conversationId: string
): Promise<void> {
  const storage = getStorage();
  await storage.delete(cacheKeys.conversationParticipants(conversationId));
}
