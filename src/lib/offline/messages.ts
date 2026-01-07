/**
 * IndexedDB Message Operations
 * 
 * Handles all message storage, retrieval, and offline queue management.
 * Optimized for instant loading and efficient sync.
 */

import { getDB, StoredMessage, PendingMessage, OfflineMessageStatus } from './db';

// Constants
const MESSAGES_PER_PAGE = 50;
const MAX_RETRY_COUNT = 3;

/**
 * Get messages for a conversation (paginated, newest first)
 */
export async function getMessages(
  conversationId: string,
  options: { limit?: number; beforeTimestamp?: number } = {}
): Promise<StoredMessage[]> {
  const db = await getDB();
  const { limit = MESSAGES_PER_PAGE, beforeTimestamp } = options;

  // Use compound index for efficient range query
  const index = db.transaction('messages').store.index('by-conversation-time');
  
  const upperBound = beforeTimestamp 
    ? [conversationId, beforeTimestamp - 1]
    : [conversationId, Date.now()];
  const lowerBound = [conversationId, 0];

  const range = IDBKeyRange.bound(lowerBound, upperBound);
  
  // Get messages in reverse order (newest first for pagination)
  const messages: StoredMessage[] = [];
  let cursor = await index.openCursor(range, 'prev');
  
  while (cursor && messages.length < limit) {
    messages.push(cursor.value);
    cursor = await cursor.continue();
  }

  // Return in chronological order for display
  return messages.reverse();
}

/**
 * Get all messages for a conversation (for initial load)
 */
export async function getAllMessages(conversationId: string): Promise<StoredMessage[]> {
  const db = await getDB();
  const index = db.transaction('messages').store.index('by-conversation');
  const messages = await index.getAll(conversationId);
  
  // Sort by timestamp
  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get message count for a conversation
 */
export async function getMessageCount(conversationId: string): Promise<number> {
  const db = await getDB();
  const index = db.transaction('messages').store.index('by-conversation');
  return index.count(conversationId);
}

/**
 * Get a single message by ID
 */
export async function getMessage(messageId: string): Promise<StoredMessage | undefined> {
  const db = await getDB();
  return db.get('messages', messageId);
}

/**
 * Get message by temp ID (for optimistic message confirmation)
 */
export async function getMessageByTempId(tempId: string): Promise<StoredMessage | undefined> {
  const db = await getDB();
  const index = db.transaction('messages').store.index('by-temp-id');
  return index.get(tempId);
}

/**
 * Save a single message
 */
export async function saveMessage(message: StoredMessage): Promise<void> {
  const db = await getDB();
  await db.put('messages', message);
}

/**
 * Save multiple messages (batch operation)
 */
export async function saveMessages(messages: StoredMessage[]): Promise<void> {
  if (messages.length === 0) return;
  
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  
  await Promise.all([
    ...messages.map(msg => tx.store.put(msg)),
    tx.done,
  ]);
}

/**
 * Update message status
 */
export async function updateMessageStatus(
  messageId: string,
  status: StoredMessage['status']
): Promise<void> {
  const db = await getDB();
  const message = await db.get('messages', messageId);
  
  if (message) {
    message.status = status;
    await db.put('messages', message);
  }
}

/**
 * Mark message as deleted (soft delete)
 */
export async function markMessageDeleted(messageId: string): Promise<void> {
  const db = await getDB();
  const message = await db.get('messages', messageId);
  
  if (message) {
    message.isDeleted = true;
    message.content = 'This message was deleted';
    await db.put('messages', message);
  }
}

/**
 * Delete messages older than timestamp (cleanup)
 */
export async function deleteOldMessages(
  conversationId: string,
  olderThan: number
): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  const index = tx.store.index('by-conversation-time');
  
  const range = IDBKeyRange.bound(
    [conversationId, 0],
    [conversationId, olderThan]
  );
  
  let deleted = 0;
  let cursor = await index.openCursor(range);
  
  while (cursor) {
    await cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }
  
  await tx.done;
  return deleted;
}

/**
 * Get newest message timestamp for a conversation (for delta sync)
 */
export async function getNewestMessageTimestamp(conversationId: string): Promise<number | null> {
  const db = await getDB();
  const index = db.transaction('messages').store.index('by-conversation-time');
  
  const range = IDBKeyRange.bound(
    [conversationId, 0],
    [conversationId, Date.now()]
  );
  
  const cursor = await index.openCursor(range, 'prev');
  return cursor?.value.createdAt ?? null;
}

// ============================================
// OFFLINE QUEUE OPERATIONS
// ============================================

/**
 * Add message to offline queue
 */
export async function queueMessage(message: Omit<PendingMessage, 'status' | 'retryCount'>): Promise<void> {
  const db = await getDB();
  
  const pendingMessage: PendingMessage = {
    ...message,
    status: 'pending',
    retryCount: 0,
  };
  
  await db.put('pendingMessages', pendingMessage);
}

/**
 * Get all pending messages (for background sync)
 */
export async function getPendingMessages(): Promise<PendingMessage[]> {
  const db = await getDB();
  const index = db.transaction('pendingMessages').store.index('by-status');
  
  const pending = await index.getAll('pending');
  const failed = await index.getAll('failed');
  
  // Filter failed messages that haven't exceeded retry limit
  const retryable = failed.filter(m => m.retryCount < MAX_RETRY_COUNT);
  
  // Sort by creation time
  return [...pending, ...retryable].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get pending messages for a specific conversation
 */
export async function getPendingMessagesForConversation(
  conversationId: string
): Promise<PendingMessage[]> {
  const db = await getDB();
  const index = db.transaction('pendingMessages').store.index('by-conversation');
  const messages = await index.getAll(conversationId);
  
  return messages
    .filter(m => m.status !== 'sent')
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Update pending message status
 */
export async function updatePendingMessageStatus(
  tempId: string,
  status: OfflineMessageStatus,
  incrementRetry = false
): Promise<void> {
  const db = await getDB();
  const message = await db.get('pendingMessages', tempId);
  
  if (message) {
    message.status = status;
    if (incrementRetry) {
      message.retryCount++;
      message.lastRetryAt = Date.now();
    }
    await db.put('pendingMessages', message);
  }
}

/**
 * Remove message from pending queue (after successful send)
 */
export async function removePendingMessage(tempId: string): Promise<void> {
  const db = await getDB();
  await db.delete('pendingMessages', tempId);
}

/**
 * Get count of pending messages
 */
export async function getPendingMessageCount(): Promise<number> {
  const db = await getDB();
  const index = db.transaction('pendingMessages').store.index('by-status');
  
  const pendingCount = await index.count('pending');
  const sendingCount = await index.count('sending');
  
  return pendingCount + sendingCount;
}

/**
 * Clear all pending messages for a conversation
 */
export async function clearPendingMessages(conversationId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('pendingMessages', 'readwrite');
  const index = tx.store.index('by-conversation');
  
  let cursor = await index.openCursor(conversationId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  
  await tx.done;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert API message to stored format
 */
export function toStoredMessage(apiMessage: {
  _id: string;
  conversation: string;
  sender: { _id: string; name?: string; username?: string; image?: string };
  content: string;
  type?: string;
  createdAt: string;
  status?: string;
  replyTo?: string;
  replyToMessage?: { _id: string; content: string; sender: { _id: string; username?: string } };
  isDeleted?: boolean;
}): StoredMessage {
  return {
    id: apiMessage._id,
    conversationId: apiMessage.conversation,
    senderId: apiMessage.sender._id,
    senderName: apiMessage.sender.name || apiMessage.sender.username || 'Unknown',
    senderImage: apiMessage.sender.image,
    content: apiMessage.content,
    type: (apiMessage.type as StoredMessage['type']) || 'text',
    createdAt: new Date(apiMessage.createdAt).getTime(),
    status: (apiMessage.status as StoredMessage['status']) || 'sent',
    replyToId: apiMessage.replyTo,
    replyToContent: apiMessage.replyToMessage?.content,
    replyToSender: apiMessage.replyToMessage?.sender.username,
    isDeleted: apiMessage.isDeleted,
  };
}

/**
 * Convert stored message to UI format
 */
export function fromStoredMessage(stored: StoredMessage): {
  _id: string;
  conversation: string;
  sender: { _id: string; username: string; image?: string };
  content: string;
  type: string;
  createdAt: string;
  status: string;
  replyTo?: string;
  replyToMessage?: { _id: string; content: string; sender: { _id: string; username: string }; isDeleted?: boolean };
  isDeleted?: boolean;
  tempId?: string;
  offlineStatus?: OfflineMessageStatus;
} {
  return {
    _id: stored.id,
    conversation: stored.conversationId,
    sender: {
      _id: stored.senderId,
      username: stored.senderName,
      image: stored.senderImage,
    },
    content: stored.content,
    type: stored.type,
    createdAt: new Date(stored.createdAt).toISOString(),
    status: stored.status,
    replyTo: stored.replyToId,
    replyToMessage: stored.replyToId ? {
      _id: stored.replyToId,
      content: stored.replyToContent || '',
      sender: { _id: '', username: stored.replyToSender || '' },
      isDeleted: false,
    } : undefined,
    isDeleted: stored.isDeleted,
    tempId: stored.tempId,
    offlineStatus: stored.offlineStatus,
  };
}
