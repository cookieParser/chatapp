/**
 * IndexedDB Database Schema and Setup
 * 
 * Local-first architecture: UI loads exclusively from IndexedDB on startup.
 * Background sync fetches only missing messages (delta sync).
 * 
 * Uses 'idb' library for Promise-based IndexedDB access.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Database version - increment when schema changes
const DB_VERSION = 1;
const DB_NAME = 'chatapp-offline';

/**
 * Message status for offline queue
 */
export type OfflineMessageStatus = 'pending' | 'sending' | 'sent' | 'failed';

/**
 * Stored message structure (optimized for IndexedDB)
 */
export interface StoredMessage {
  id: string;                    // MongoDB _id
  conversationId: string;        // Index for fast lookup
  senderId: string;
  senderName: string;
  senderImage?: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  createdAt: number;             // Timestamp (ms) for sorting
  status: 'sent' | 'delivered' | 'read';
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
  isDeleted?: boolean;
  // Offline-specific
  tempId?: string;               // For optimistic messages
  offlineStatus?: OfflineMessageStatus;
  retryCount?: number;
}

/**
 * Stored conversation/chat structure
 */
export interface StoredConversation {
  id: string;                    // MongoDB _id
  type: 'direct' | 'group';
  name: string;
  image?: string;
  participantIds: string[];
  lastMessageId?: string;
  lastMessageContent?: string;
  lastMessageAt: number;         // Timestamp for sorting
  lastMessageSender?: string;
  unreadCount: number;
  isMuted: boolean;
  mutedUntil?: number;
  updatedAt: number;
  // Sync metadata
  lastSyncAt: number;            // Last successful sync timestamp
  oldestLoadedAt?: number;       // For pagination (load older messages)
}

/**
 * Sync metadata for delta sync
 */
export interface SyncMetadata {
  id: string;                    // 'global' or conversationId
  lastSyncTimestamp: number;     // Server timestamp of last sync
  lastMessageId?: string;        // Last known message ID
  syncInProgress: boolean;
}

/**
 * Pending outgoing message (offline queue)
 */
export interface PendingMessage {
  tempId: string;                // Unique temp ID
  conversationId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  replyToId?: string;
  createdAt: number;
  status: OfflineMessageStatus;
  retryCount: number;
  lastRetryAt?: number;
}

/**
 * User cache for offline access
 */
export interface StoredUser {
  id: string;
  name: string;
  image?: string;
  lastSeen?: number;
  isOnline?: boolean;
  updatedAt: number;
}

/**
 * IndexedDB Schema Definition
 */
interface ChatDBSchema extends DBSchema {
  messages: {
    key: string;
    value: StoredMessage;
    indexes: {
      'by-conversation': string;
      'by-conversation-time': [string, number];
      'by-temp-id': string;
    };
  };
  conversations: {
    key: string;
    value: StoredConversation;
    indexes: {
      'by-last-message': number;
      'by-updated': number;
    };
  };
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
  pendingMessages: {
    key: string;
    value: PendingMessage;
    indexes: {
      'by-conversation': string;
      'by-status': OfflineMessageStatus;
      'by-created': number;
    };
  };
  users: {
    key: string;
    value: StoredUser;
    indexes: {
      'by-updated': number;
    };
  };
  keyValue: {
    key: string;
    value: { key: string; value: unknown; updatedAt: number };
  };
}

let dbInstance: IDBPDatabase<ChatDBSchema> | null = null;

/**
 * Initialize and get database instance
 */
export async function getDB(): Promise<IDBPDatabase<ChatDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ChatDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
        messageStore.createIndex('by-conversation', 'conversationId');
        messageStore.createIndex('by-conversation-time', ['conversationId', 'createdAt']);
        messageStore.createIndex('by-temp-id', 'tempId');
      }

      // Conversations store
      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
        convStore.createIndex('by-last-message', 'lastMessageAt');
        convStore.createIndex('by-updated', 'updatedAt');
      }

      // Sync metadata store
      if (!db.objectStoreNames.contains('syncMetadata')) {
        db.createObjectStore('syncMetadata', { keyPath: 'id' });
      }

      // Pending messages store (offline queue)
      if (!db.objectStoreNames.contains('pendingMessages')) {
        const pendingStore = db.createObjectStore('pendingMessages', { keyPath: 'tempId' });
        pendingStore.createIndex('by-conversation', 'conversationId');
        pendingStore.createIndex('by-status', 'status');
        pendingStore.createIndex('by-created', 'createdAt');
      }

      // Users cache store
      if (!db.objectStoreNames.contains('users')) {
        const userStore = db.createObjectStore('users', { keyPath: 'id' });
        userStore.createIndex('by-updated', 'updatedAt');
      }

      // Key-value store for misc data
      if (!db.objectStoreNames.contains('keyValue')) {
        db.createObjectStore('keyValue', { keyPath: 'key' });
      }
    },
    blocked() {
      console.warn('IndexedDB blocked - close other tabs');
    },
    blocking() {
      // Close connection if blocking upgrade in another tab
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      dbInstance = null;
    },
  });

  return dbInstance;
}

/**
 * Close database connection
 */
export async function closeDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Clear all data (for logout)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['messages', 'conversations', 'syncMetadata', 'pendingMessages', 'users', 'keyValue'],
    'readwrite'
  );
  
  await Promise.all([
    tx.objectStore('messages').clear(),
    tx.objectStore('conversations').clear(),
    tx.objectStore('syncMetadata').clear(),
    tx.objectStore('pendingMessages').clear(),
    tx.objectStore('users').clear(),
    tx.objectStore('keyValue').clear(),
    tx.done,
  ]);
}

export type { IDBPDatabase, ChatDBSchema };
