/**
 * Background Sync for Offline Messages
 * 
 * Uses the Background Sync API to retry sending messages
 * when the device comes back online.
 */

import {
  getPendingMessages,
  updatePendingMessageStatus,
  removePendingMessage,
  saveMessage,
  PendingMessage,
} from './index';
import { api } from '@/services/api';

const SYNC_TAG = 'send-messages';

// Extend ServiceWorkerRegistration type for sync
declare global {
  interface ServiceWorkerRegistration {
    sync?: SyncManager;
  }
  interface SyncManager {
    register(tag: string): Promise<void>;
  }
}

/**
 * Register for background sync
 */
export async function registerBackgroundSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    if (!registration.sync) {
      console.log('Background Sync not supported');
      return false;
    }
    
    await registration.sync.register(SYNC_TAG);
    console.log('Background sync registered');
    return true;
  } catch (error) {
    console.error('Background sync registration failed:', error);
    return false;
  }
}

interface SendMessageResponse {
  success: boolean;
  message?: { _id: string };
  error?: string;
}

/**
 * Send a single pending message
 */
async function sendPendingMessage(message: PendingMessage): Promise<boolean> {
  try {
    await updatePendingMessageStatus(message.tempId, 'sending');

    const response = await api.post<SendMessageResponse>('/messages/send', {
      conversationId: message.conversationId,
      content: message.content,
      type: message.type,
      replyToId: message.replyToId,
      tempId: message.tempId,
    });

    if (response?.success && response.message) {
      // Save confirmed message to IndexedDB
      await saveMessage({
        id: response.message._id,
        conversationId: message.conversationId,
        senderId: '', // Will be filled by server response
        senderName: '',
        content: message.content,
        type: message.type,
        createdAt: message.createdAt,
        status: 'sent',
        tempId: message.tempId,
      });

      // Remove from pending queue
      await removePendingMessage(message.tempId);
      return true;
    } else {
      throw new Error(response?.error || 'Send failed');
    }
  } catch (error) {
    console.error(`Failed to send message ${message.tempId}:`, error);
    await updatePendingMessageStatus(message.tempId, 'failed', true);
    return false;
  }
}

/**
 * Process all pending messages
 * Called by service worker on sync event or manually
 */
export async function sendPendingMessagesNow(): Promise<{
  sent: number;
  failed: number;
}> {
  const pending = await getPendingMessages();
  
  if (pending.length === 0) {
    return { sent: 0, failed: 0 };
  }

  console.log(`Processing ${pending.length} pending messages`);

  let sent = 0;
  let failed = 0;

  // Process messages in order (FIFO)
  for (const message of pending) {
    const success = await sendPendingMessage(message);
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }

  console.log(`Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

/**
 * Check if we're online and try to send pending messages
 */
export async function trySendPendingOnOnline(): Promise<void> {
  if (!navigator.onLine) return;

  const pending = await getPendingMessages();
  if (pending.length > 0) {
    // Try background sync first
    const registered = await registerBackgroundSync();
    
    // If background sync not available, send immediately
    if (!registered) {
      await sendPendingMessagesNow();
    }
  }
}

// Listen for online event
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Back online, checking pending messages...');
    trySendPendingOnOnline().catch(console.error);
  });
}
