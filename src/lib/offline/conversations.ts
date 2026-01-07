/**
 * IndexedDB Conversation Operations
 * 
 * Handles conversation storage and retrieval for instant chat list loading.
 */

import { getDB, StoredConversation, SyncMetadata } from './db';

/**
 * Get all conversations sorted by last message time
 */
export async function getConversations(): Promise<StoredConversation[]> {
  const db = await getDB();
  const index = db.transaction('conversations').store.index('by-last-message');
  
  // Get all and sort descending (newest first)
  const conversations = await index.getAll();
  return conversations.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

/**
 * Get a single conversation by ID
 */
export async function getConversation(conversationId: string): Promise<StoredConversation | undefined> {
  const db = await getDB();
  return db.get('conversations', conversationId);
}

/**
 * Save a conversation
 */
export async function saveConversation(conversation: StoredConversation): Promise<void> {
  const db = await getDB();
  await db.put('conversations', conversation);
}

/**
 * Save multiple conversations (batch)
 */
export async function saveConversations(conversations: StoredConversation[]): Promise<void> {
  if (conversations.length === 0) return;
  
  const db = await getDB();
  const tx = db.transaction('conversations', 'readwrite');
  
  await Promise.all([
    ...conversations.map(conv => tx.store.put(conv)),
    tx.done,
  ]);
}

/**
 * Update conversation's last message info
 */
export async function updateConversationLastMessage(
  conversationId: string,
  lastMessage: {
    id: string;
    content: string;
    senderName: string;
    timestamp: number;
  }
): Promise<void> {
  const db = await getDB();
  const conversation = await db.get('conversations', conversationId);
  
  if (conversation) {
    conversation.lastMessageId = lastMessage.id;
    conversation.lastMessageContent = lastMessage.content;
    conversation.lastMessageSender = lastMessage.senderName;
    conversation.lastMessageAt = lastMessage.timestamp;
    conversation.updatedAt = Date.now();
    await db.put('conversations', conversation);
  }
}

/**
 * Increment unread count for a conversation
 */
export async function incrementUnreadCount(conversationId: string): Promise<void> {
  const db = await getDB();
  const conversation = await db.get('conversations', conversationId);
  
  if (conversation) {
    conversation.unreadCount++;
    await db.put('conversations', conversation);
  }
}

/**
 * Reset unread count for a conversation
 */
export async function resetUnreadCount(conversationId: string): Promise<void> {
  const db = await getDB();
  const conversation = await db.get('conversations', conversationId);
  
  if (conversation && conversation.unreadCount > 0) {
    conversation.unreadCount = 0;
    await db.put('conversations', conversation);
  }
}

/**
 * Get total unread count across all conversations
 */
export async function getTotalUnreadCount(): Promise<number> {
  const db = await getDB();
  const conversations = await db.getAll('conversations');
  return conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
}

/**
 * Update conversation mute settings
 */
export async function updateMuteSettings(
  conversationId: string,
  isMuted: boolean,
  mutedUntil?: number
): Promise<void> {
  const db = await getDB();
  const conversation = await db.get('conversations', conversationId);
  
  if (conversation) {
    conversation.isMuted = isMuted;
    conversation.mutedUntil = mutedUntil;
    await db.put('conversations', conversation);
  }
}

/**
 * Delete a conversation and its messages
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const db = await getDB();
  
  // Delete conversation
  await db.delete('conversations', conversationId);
  
  // Delete all messages for this conversation
  const tx = db.transaction('messages', 'readwrite');
  const index = tx.store.index('by-conversation');
  
  let cursor = await index.openCursor(conversationId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  
  await tx.done;
  
  // Delete sync metadata
  await db.delete('syncMetadata', conversationId);
}

// ============================================
// SYNC METADATA OPERATIONS
// ============================================

/**
 * Get sync metadata for a conversation or global
 */
export async function getSyncMetadata(id: string = 'global'): Promise<SyncMetadata | undefined> {
  const db = await getDB();
  return db.get('syncMetadata', id);
}

/**
 * Update sync metadata
 */
export async function updateSyncMetadata(metadata: SyncMetadata): Promise<void> {
  const db = await getDB();
  await db.put('syncMetadata', metadata);
}

/**
 * Mark sync as in progress
 */
export async function setSyncInProgress(id: string, inProgress: boolean): Promise<void> {
  const db = await getDB();
  const metadata = await db.get('syncMetadata', id);
  
  if (metadata) {
    metadata.syncInProgress = inProgress;
    await db.put('syncMetadata', metadata);
  } else {
    await db.put('syncMetadata', {
      id,
      lastSyncTimestamp: 0,
      syncInProgress: inProgress,
    });
  }
}

/**
 * Update last sync timestamp
 */
export async function updateLastSyncTimestamp(
  id: string,
  timestamp: number,
  lastMessageId?: string
): Promise<void> {
  const db = await getDB();
  const metadata = await db.get('syncMetadata', id) || {
    id,
    lastSyncTimestamp: 0,
    syncInProgress: false,
  };
  
  metadata.lastSyncTimestamp = timestamp;
  if (lastMessageId) {
    metadata.lastMessageId = lastMessageId;
  }
  metadata.syncInProgress = false;
  
  await db.put('syncMetadata', metadata);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert API conversation to stored format
 */
export function toStoredConversation(apiConv: {
  _id: string;
  type: string;
  name?: string;
  image?: string;
  participants: Array<{ user: { _id: string; name?: string; image?: string }; isActive: boolean }>;
  lastMessage?: { _id: string; content: string; sender?: { name?: string }; createdAt: string };
  unreadCount?: number;
  updatedAt?: string;
}, currentUserId: string): StoredConversation {
  // For direct chats, use the other participant's info
  const otherParticipant = apiConv.type === 'direct'
    ? apiConv.participants.find(p => p.user._id !== currentUserId && p.isActive)
    : null;

  return {
    id: apiConv._id,
    type: apiConv.type as 'direct' | 'group',
    name: apiConv.name || otherParticipant?.user.name || 'Unknown',
    image: apiConv.image || otherParticipant?.user.image,
    participantIds: apiConv.participants
      .filter(p => p.isActive)
      .map(p => p.user._id),
    lastMessageId: apiConv.lastMessage?._id,
    lastMessageContent: apiConv.lastMessage?.content,
    lastMessageAt: apiConv.lastMessage 
      ? new Date(apiConv.lastMessage.createdAt).getTime() 
      : 0,
    lastMessageSender: apiConv.lastMessage?.sender?.name,
    unreadCount: apiConv.unreadCount || 0,
    isMuted: false,
    updatedAt: apiConv.updatedAt ? new Date(apiConv.updatedAt).getTime() : Date.now(),
    lastSyncAt: Date.now(),
  };
}

/**
 * Convert stored conversation to UI format
 */
export function fromStoredConversation(stored: StoredConversation): {
  _id: string;
  type: string;
  name: string;
  image?: string;
  participants: Array<{ user: { _id: string } }>;
  lastMessage?: { _id: string; content: string; createdAt: string; sender?: { name: string } };
  unreadCount: number;
} {
  return {
    _id: stored.id,
    type: stored.type,
    name: stored.name,
    image: stored.image,
    participants: stored.participantIds.map(id => ({ user: { _id: id } })),
    lastMessage: stored.lastMessageId ? {
      _id: stored.lastMessageId,
      content: stored.lastMessageContent || '',
      createdAt: new Date(stored.lastMessageAt).toISOString(),
      sender: stored.lastMessageSender ? { name: stored.lastMessageSender } : undefined,
    } : undefined,
    unreadCount: stored.unreadCount,
  };
}
