/**
 * Delta Sync Service
 * 
 * Fetches only missing messages since last sync.
 * Runs in background without blocking UI.
 */

import {
  getSyncMetadata,
  updateLastSyncTimestamp,
  setSyncInProgress,
  saveConversations,
  toStoredConversation,
  getConversation,
  updateConversationLastMessage,
  incrementUnreadCount as incrementConvUnread,
} from './conversations';
import {
  saveMessages,
  toStoredMessage,
  getNewestMessageTimestamp,
} from './messages';
import { StoredMessage } from './db';
import { api } from '@/services/api';

// Sync configuration
const SYNC_DEBOUNCE_MS = 2000;
const MIN_SYNC_INTERVAL_MS = 30000; // Don't sync more than once per 30s

let syncTimeout: NodeJS.Timeout | null = null;
let lastSyncAttempt = 0;

interface SyncResult {
  success: boolean;
  newMessages: number;
  updatedConversations: number;
  error?: string;
}

interface DeltaSyncResponse {
  conversations: any[];
  messages: any[];
  serverTimestamp: number;
}

interface ConversationSyncResponse {
  messages: any[];
  serverTimestamp: number;
}

interface InitialSyncResponse {
  conversations: any[];
  serverTimestamp: number;
}

/**
 * Perform delta sync for all conversations
 * Only fetches messages newer than last sync
 */
export async function performDeltaSync(currentUserId: string): Promise<SyncResult> {
  const now = Date.now();
  
  // Prevent too frequent syncs
  if (now - lastSyncAttempt < MIN_SYNC_INTERVAL_MS) {
    return { success: true, newMessages: 0, updatedConversations: 0 };
  }
  
  lastSyncAttempt = now;
  
  const globalMeta = await getSyncMetadata('global');
  
  // Check if sync already in progress
  if (globalMeta?.syncInProgress) {
    return { success: false, newMessages: 0, updatedConversations: 0, error: 'Sync in progress' };
  }
  
  try {
    await setSyncInProgress('global', true);
    
    const lastSync = globalMeta?.lastSyncTimestamp || 0;
    
    // Fetch updated conversations and messages since last sync
    const response = await api.get<DeltaSyncResponse>(`/sync/delta?since=${lastSync}`);
    
    if (!response) {
      throw new Error('Invalid sync response');
    }
    
    const { conversations, messages, serverTimestamp } = response;
    
    // Save conversations
    if (conversations.length > 0) {
      const storedConvs = conversations.map((c: any) => toStoredConversation(c, currentUserId));
      await saveConversations(storedConvs);
    }
    
    // Save messages
    if (messages.length > 0) {
      const storedMsgs = messages.map(toStoredMessage);
      await saveMessages(storedMsgs);
      
      // Update conversation last message info
      const messagesByConv = new Map<string, StoredMessage[]>();
      for (const msg of storedMsgs) {
        if (!messagesByConv.has(msg.conversationId)) {
          messagesByConv.set(msg.conversationId, []);
        }
        messagesByConv.get(msg.conversationId)!.push(msg);
      }
      
      for (const [convId, convMsgs] of messagesByConv) {
        const newest = convMsgs.reduce((a: StoredMessage, b: StoredMessage) => 
          a.createdAt > b.createdAt ? a : b
        );
        await updateConversationLastMessage(convId, {
          id: newest.id,
          content: newest.content,
          senderName: newest.senderName,
          timestamp: newest.createdAt,
        });
      }
    }
    
    // Update sync timestamp
    await updateLastSyncTimestamp('global', serverTimestamp);
    
    return {
      success: true,
      newMessages: messages.length,
      updatedConversations: conversations.length,
    };
  } catch (error) {
    console.error('Delta sync failed:', error);
    await setSyncInProgress('global', false);
    return {
      success: false,
      newMessages: 0,
      updatedConversations: 0,
      error: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}

/**
 * Sync a specific conversation's messages
 */
export async function syncConversationMessages(
  conversationId: string,
  currentUserId: string
): Promise<SyncResult> {
  const convMeta = await getSyncMetadata(conversationId);
  
  if (convMeta?.syncInProgress) {
    return { success: false, newMessages: 0, updatedConversations: 0, error: 'Sync in progress' };
  }
  
  try {
    await setSyncInProgress(conversationId, true);
    
    // Get newest local message timestamp
    const newestLocal = await getNewestMessageTimestamp(conversationId);
    const since = newestLocal || 0;
    
    // Fetch newer messages
    const response = await api.get<ConversationSyncResponse>(
      `/conversations/${conversationId}/messages/sync?since=${since}`
    );
    
    if (!response) {
      throw new Error('Invalid sync response');
    }
    
    const { messages, serverTimestamp } = response;
    
    if (messages.length > 0) {
      const storedMsgs = messages.map(toStoredMessage);
      await saveMessages(storedMsgs);
      
      // Update conversation last message
      const newest = storedMsgs.reduce((a: StoredMessage, b: StoredMessage) => 
        a.createdAt > b.createdAt ? a : b
      );
      await updateConversationLastMessage(conversationId, {
        id: newest.id,
        content: newest.content,
        senderName: newest.senderName,
        timestamp: newest.createdAt,
      });
    }
    
    await updateLastSyncTimestamp(conversationId, serverTimestamp);
    
    return {
      success: true,
      newMessages: messages.length,
      updatedConversations: messages.length > 0 ? 1 : 0,
    };
  } catch (error) {
    console.error(`Sync failed for conversation ${conversationId}:`, error);
    await setSyncInProgress(conversationId, false);
    return {
      success: false,
      newMessages: 0,
      updatedConversations: 0,
      error: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}

/**
 * Schedule a debounced sync
 */
export function scheduleDeltaSync(currentUserId: string): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  syncTimeout = setTimeout(() => {
    performDeltaSync(currentUserId).catch(console.error);
    syncTimeout = null;
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Handle incoming message from push/socket
 * Saves to IndexedDB and updates conversation
 */
export async function handleIncomingMessage(
  message: {
    messageId: string;
    conversationId: string;
    senderId: string;
    senderName?: string;
    content: string;
    type?: string;
    createdAt: string;
  },
  currentUserId: string
): Promise<void> {
  // Save message to IndexedDB
  await saveMessages([{
    id: message.messageId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.senderName || 'Unknown',
    content: message.content,
    type: (message.type as any) || 'text',
    createdAt: new Date(message.createdAt).getTime(),
    status: 'delivered',
  }]);
  
  // Update conversation
  await updateConversationLastMessage(message.conversationId, {
    id: message.messageId,
    content: message.content,
    senderName: message.senderName || 'Unknown',
    timestamp: new Date(message.createdAt).getTime(),
  });
  
  // Increment unread if not from current user
  if (message.senderId !== currentUserId) {
    await incrementConvUnread(message.conversationId);
  }
}

/**
 * Initial sync on app startup
 * Loads conversations and recent messages
 */
export async function performInitialSync(currentUserId: string): Promise<SyncResult> {
  try {
    await setSyncInProgress('global', true);
    
    // Fetch all conversations with last messages
    const response = await api.get<InitialSyncResponse>(
      '/conversations?includeLastMessage=true'
    );
    
    if (!response) {
      throw new Error('Invalid response');
    }
    
    const { conversations, serverTimestamp } = response;
    
    // Save conversations
    const storedConvs = conversations.map((c: any) => toStoredConversation(c, currentUserId));
    await saveConversations(storedConvs);
    
    // Update sync timestamp
    await updateLastSyncTimestamp('global', serverTimestamp || Date.now());
    
    return {
      success: true,
      newMessages: 0,
      updatedConversations: conversations.length,
    };
  } catch (error) {
    console.error('Initial sync failed:', error);
    await setSyncInProgress('global', false);
    return {
      success: false,
      newMessages: 0,
      updatedConversations: 0,
      error: error instanceof Error ? error.message : 'Initial sync failed',
    };
  }
}
