/**
 * Offline Module - Local-First Architecture
 * 
 * Provides IndexedDB-based storage for instant app loading.
 * UI loads exclusively from local storage, background sync fetches updates.
 */

// Database
export {
  getDB,
  closeDB,
  clearAllData,
  type StoredMessage,
  type StoredConversation,
  type SyncMetadata,
  type PendingMessage,
  type StoredUser,
  type OfflineMessageStatus,
} from './db';

// Message operations
export {
  getMessages,
  getAllMessages,
  getMessageCount,
  getMessage,
  getMessageByTempId,
  saveMessage,
  saveMessages,
  updateMessageStatus,
  markMessageDeleted,
  deleteOldMessages,
  getNewestMessageTimestamp,
  // Offline queue
  queueMessage,
  getPendingMessages,
  getPendingMessagesForConversation,
  updatePendingMessageStatus,
  removePendingMessage,
  getPendingMessageCount,
  clearPendingMessages,
  // Converters
  toStoredMessage,
  fromStoredMessage,
} from './messages';

// Conversation operations
export {
  getConversations,
  getConversation,
  saveConversation,
  saveConversations,
  updateConversationLastMessage,
  incrementUnreadCount,
  resetUnreadCount,
  getTotalUnreadCount,
  updateMuteSettings,
  deleteConversation,
  // Sync metadata
  getSyncMetadata,
  updateSyncMetadata,
  setSyncInProgress,
  updateLastSyncTimestamp,
  // Converters
  toStoredConversation,
  fromStoredConversation,
} from './conversations';

// Sync operations
export {
  performDeltaSync,
  syncConversationMessages,
  scheduleDeltaSync,
  handleIncomingMessage,
  performInitialSync,
} from './sync';

// Background sync registration
export { registerBackgroundSync, sendPendingMessagesNow } from './backgroundSync';
