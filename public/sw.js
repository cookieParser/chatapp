/**
 * Service Worker for WhatsApp-like PWA Performance
 * 
 * Features:
 * - Cache-first for app shell (instant loading)
 * - Push notifications with IndexedDB message storage
 * - Background sync for offline messages
 * - Stale-while-revalidate for dynamic content
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `chatapp-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `chatapp-dynamic-${CACHE_VERSION}`;

// App shell - cache first, always available
const APP_SHELL = [
  '/',
  '/login',
  '/manifest.json',
  '/icons/icon-72.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// IndexedDB configuration (must match client)
const DB_NAME = 'chatapp-offline';
const DB_VERSION = 1;

// ============================================
// INSTALL - Cache app shell
// ============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(APP_SHELL).catch((err) => {
          console.warn('[SW] Some assets failed to cache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================
// ACTIVATE - Clean old caches
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map((key) => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ============================================
// FETCH - Cache strategies
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API requests and socket connections
  if (url.pathname.startsWith('/api/') || 
      url.pathname.includes('socket') ||
      url.pathname.includes('_next/webpack-hmr')) {
    return;
  }

  // Cache-first for static assets (JS, CSS, images)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Cache-first for app shell pages
  if (isAppShellPage(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Network-first with cache fallback for everything else
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

/**
 * Cache-first strategy
 * Returns cached response immediately, updates cache in background
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    // Update cache in background (stale-while-revalidate)
    fetchAndCache(request, cacheName).catch(() => {});
    return cached;
  }
  return fetchAndCache(request, cacheName);
}

/**
 * Network-first strategy
 * Try network, fall back to cache
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    
    // Return offline page for navigation
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Fetch and cache response
 */
async function fetchAndCache(request, cacheName) {
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Check if URL is a static asset
 */
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(pathname) ||
         pathname.startsWith('/_next/static/');
}

/**
 * Check if URL is an app shell page
 */
function isAppShellPage(pathname) {
  return pathname === '/' || 
         pathname === '/login' || 
         pathname === '/chat' ||
         pathname.startsWith('/chat/');
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[SW] Push received but no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[SW] Failed to parse push data:', e);
    return;
  }

  console.log('[SW] Push received:', data.type);

  // Handle different push types
  if (data.type === 'message') {
    event.waitUntil(handleMessagePush(data));
  } else if (data.type === 'notification') {
    event.waitUntil(showNotification(data));
  }
});

/**
 * Handle incoming message push
 * Saves to IndexedDB BEFORE showing notification
 */
async function handleMessagePush(data) {
  const { message, notification } = data;

  // Save message to IndexedDB first
  if (message) {
    try {
      await saveMessageToIndexedDB(message);
      console.log('[SW] Message saved to IndexedDB');
    } catch (error) {
      console.error('[SW] Failed to save message:', error);
    }
  }

  // Update badge count
  if ('setAppBadge' in navigator) {
    try {
      const unreadCount = await getUnreadCountFromIndexedDB();
      await navigator.setAppBadge(unreadCount);
    } catch (e) {
      console.warn('[SW] Badge update failed:', e);
    }
  }

  // Show notification
  if (notification) {
    const options = {
      body: notification.body || message?.content || 'New message',
      icon: notification.icon || '/icons/icon-192.svg',
      badge: '/icons/icon-72.svg',
      tag: `chat-${message?.conversationId || 'general'}`,
      data: {
        url: notification.url || `/chat/${message?.conversationId}`,
        conversationId: message?.conversationId,
        messageId: message?.messageId,
      },
      vibrate: [100, 50, 100],
      requireInteraction: false,
      renotify: true,
      actions: [
        { action: 'reply', title: 'Reply' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    await self.registration.showNotification(
      notification.title || 'New Message',
      options
    );
  }

  // Notify open clients to refresh
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => {
    client.postMessage({
      type: 'NEW_MESSAGE',
      message: message,
    });
  });
}

/**
 * Show a simple notification
 */
async function showNotification(data) {
  const { title, body, icon, url, tag } = data;

  await self.registration.showNotification(title || 'ChatApp', {
    body: body || 'You have a new notification',
    icon: icon || '/icons/icon-192.svg',
    badge: '/icons/icon-72.svg',
    tag: tag || 'general',
    data: { url },
    vibrate: [100, 50, 100],
  });
}

// ============================================
// NOTIFICATION CLICK
// ============================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if (url !== '/') {
              client.navigate(url);
            }
            return;
          }
        }
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ============================================
// BACKGROUND SYNC
// ============================================
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);

  if (event.tag === 'send-messages') {
    event.waitUntil(sendPendingMessages());
  }
});

/**
 * Send all pending messages from IndexedDB queue
 */
async function sendPendingMessages() {
  console.log('[SW] Processing pending messages...');

  try {
    const db = await openIndexedDB();
    const tx = db.transaction('pendingMessages', 'readonly');
    const store = tx.objectStore('pendingMessages');
    const pending = await getAllFromStore(store);

    if (pending.length === 0) {
      console.log('[SW] No pending messages');
      return;
    }

    console.log(`[SW] Found ${pending.length} pending messages`);

    for (const message of pending) {
      if (message.status === 'sent') continue;

      try {
        const response = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: message.conversationId,
            content: message.content,
            type: message.type,
            replyToId: message.replyToId,
            tempId: message.tempId,
          }),
        });

        if (response.ok) {
          // Remove from pending queue
          await removeFromIndexedDB('pendingMessages', message.tempId);
          console.log(`[SW] Message ${message.tempId} sent successfully`);
        } else {
          console.error(`[SW] Failed to send message ${message.tempId}`);
        }
      } catch (error) {
        console.error(`[SW] Error sending message ${message.tempId}:`, error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// ============================================
// INDEXEDDB HELPERS (for Service Worker)
// ============================================

/**
 * Open IndexedDB connection
 */
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('by-conversation', 'conversationId');
        msgStore.createIndex('by-conversation-time', ['conversationId', 'createdAt']);
        msgStore.createIndex('by-temp-id', 'tempId');
      }

      // Conversations store
      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
        convStore.createIndex('by-last-message', 'lastMessageAt');
        convStore.createIndex('by-updated', 'updatedAt');
      }

      // Pending messages store
      if (!db.objectStoreNames.contains('pendingMessages')) {
        const pendingStore = db.createObjectStore('pendingMessages', { keyPath: 'tempId' });
        pendingStore.createIndex('by-conversation', 'conversationId');
        pendingStore.createIndex('by-status', 'status');
        pendingStore.createIndex('by-created', 'createdAt');
      }

      // Sync metadata store
      if (!db.objectStoreNames.contains('syncMetadata')) {
        db.createObjectStore('syncMetadata', { keyPath: 'id' });
      }

      // Users store
      if (!db.objectStoreNames.contains('users')) {
        const userStore = db.createObjectStore('users', { keyPath: 'id' });
        userStore.createIndex('by-updated', 'updatedAt');
      }

      // Key-value store
      if (!db.objectStoreNames.contains('keyValue')) {
        db.createObjectStore('keyValue', { keyPath: 'key' });
      }
    };
  });
}

/**
 * Save message to IndexedDB
 */
async function saveMessageToIndexedDB(message) {
  const db = await openIndexedDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['messages', 'conversations'], 'readwrite');

    // Save message
    const msgStore = tx.objectStore('messages');
    const storedMessage = {
      id: message.messageId || message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.senderName || 'Unknown',
      senderImage: message.senderImage,
      content: message.content,
      type: message.type || 'text',
      createdAt: new Date(message.createdAt).getTime(),
      status: 'delivered',
    };
    msgStore.put(storedMessage);

    // Update conversation
    const convStore = tx.objectStore('conversations');
    const convRequest = convStore.get(message.conversationId);

    convRequest.onsuccess = () => {
      const conv = convRequest.result;
      if (conv) {
        conv.lastMessageId = storedMessage.id;
        conv.lastMessageContent = storedMessage.content;
        conv.lastMessageSender = storedMessage.senderName;
        conv.lastMessageAt = storedMessage.createdAt;
        conv.unreadCount = (conv.unreadCount || 0) + 1;
        conv.updatedAt = Date.now();
        convStore.put(conv);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get unread count from IndexedDB
 */
async function getUnreadCountFromIndexedDB() {
  const db = await openIndexedDB();

  return new Promise((resolve) => {
    const tx = db.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');
    const request = store.getAll();

    request.onsuccess = () => {
      const conversations = request.result || [];
      const total = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
      resolve(total);
    };

    request.onerror = () => resolve(0);
  });
}

/**
 * Remove item from IndexedDB store
 */
async function removeFromIndexedDB(storeName, key) {
  const db = await openIndexedDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all items from a store
 */
function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// MESSAGE FROM CLIENT
// ============================================
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker loaded');
