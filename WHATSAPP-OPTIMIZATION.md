# WhatsApp-Like Performance Optimization Guide

This document outlines the architecture and implementation for achieving WhatsApp-like performance in your chat PWA.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (PWA)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │  React UI   │  │ Zustand Store│  │  IndexedDB  │  │  Service Worker  │  │
│  │  (instant)  │◄─┤  (in-memory) │◄─┤  (persist)  │◄─┤  (push + cache)  │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ WebSocket (foreground only)
                                      │ Web Push (background)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVER                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  Socket.IO      │  │  Push Service   │  │  REST API                   │ │
│  │  (Redis Adapter)│  │  (Web Push)     │  │  (delta sync)               │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           └───────────────────┬┴─────────────────────────┘                  │
│                               ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         Redis + MongoDB                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation Checklist

### Phase 1: Local-First Architecture ✅

- [x] IndexedDB schema for messages, conversations, sync metadata
- [x] Load UI exclusively from IndexedDB on startup
- [x] Delta sync to fetch only missing messages
- [x] Offline message queue with retry logic

**Files:**
- `src/lib/offline/db.ts` - Database schema
- `src/lib/offline/messages.ts` - Message operations
- `src/lib/offline/conversations.ts` - Conversation operations
- `src/lib/offline/sync.ts` - Delta sync logic
- `src/lib/offline/backgroundSync.ts` - Background sync API

### Phase 2: Push-Based Message Delivery ✅

- [x] Web Push configuration (VAPID keys)
- [x] Service Worker push handler
- [x] Save messages to IndexedDB on push receipt
- [x] Update unread count in IndexedDB
- [x] Server-side push notification service

**Files:**
- `public/sw.js` - Service Worker with push handling
- `src/lib/push/index.ts` - Push notification service
- `src/app/api/notifications/push/subscribe/route.ts` - Subscription API
- `src/hooks/usePushNotifications.ts` - Client-side hook

### Phase 3: Socket.IO Optimization ✅

- [x] Connect only when app is visible (foreground)
- [x] Silent reconnection with exponential backoff
- [x] Use socket only for typing, presence, read receipts
- [x] Redis adapter for multi-instance scaling
- [x] Batched read receipts

**Files:**
- `src/hooks/useOptimizedSocket.ts` - Optimized socket hook
- `src/lib/socket/server.ts` - Server with push integration

### Phase 4: Performance Optimization ✅

- [x] MessagePack binary serialization available
- [x] Cache-first strategy for app shell
- [x] Debounced typing indicators
- [x] Batched receipt updates

**Files:**
- `src/lib/performance/messageSerializer.ts` - MessagePack
- `public/sw.js` - Cache strategies

### Phase 5: Offline & Background Sync ✅

- [x] Queue outgoing messages in IndexedDB
- [x] Background Sync API registration
- [x] Message ordering and deduplication
- [x] Online/offline event handling

**Files:**
- `src/lib/offline/backgroundSync.ts` - Background sync
- `src/hooks/useOfflineFirst.ts` - Offline-first hooks

---

## Usage Guide

### 1. App Startup (Zero Loading)

```tsx
import { useAppStartup, useOfflineConversations } from '@/hooks';

function ChatApp() {
  const { userId } = useSession();
  
  // Initialize app with instant loading
  const { isReady, hasLocalData, isSyncing } = useAppStartup({ userId });
  
  // Load conversations from IndexedDB (instant)
  const { conversations, isLoading } = useOfflineConversations({ userId });
  
  // Show UI immediately if we have local data
  if (!isReady && !hasLocalData) {
    return <LoadingScreen />;
  }
  
  return <ChatList conversations={conversations} syncing={isSyncing} />;
}
```

### 2. Message Loading (Instant)

```tsx
import { useOfflineMessages } from '@/hooks';

function ChatView({ conversationId }) {
  const { userId } = useSession();
  
  const {
    messages,
    isLoading,
    sendMessage,
    addMessage,
    markAsRead,
  } = useOfflineMessages({ conversationId, userId });
  
  // Messages load instantly from IndexedDB
  // Background sync fetches any missing messages
  
  return <MessageList messages={messages} />;
}
```

### 3. Socket Connection (Foreground Only)

```tsx
import { useOptimizedSocket } from '@/hooks';

function ChatProvider({ children }) {
  const { userId, username } = useSession();
  
  const {
    isConnected,
    connectionState,
    sendMessage,
    startTyping,
    stopTyping,
    markRead,
  } = useOptimizedSocket({
    userId,
    username,
    onMessage: (msg) => {
      // Handle incoming message
      // (Also saved to IndexedDB by service worker via push)
    },
    onTypingStart: (data) => {
      // Show typing indicator
    },
  });
  
  // Socket auto-connects when app is visible
  // Auto-disconnects when app goes to background
  
  return <SocketContext.Provider value={...}>{children}</SocketContext.Provider>;
}
```

### 4. Push Notifications

```tsx
import { usePushNotifications } from '@/hooks';

function NotificationSettings() {
  const { userId } = useSession();
  
  const {
    isSupported,
    permission,
    isSubscribed,
    subscribe,
    unsubscribe,
  } = usePushNotifications({ userId });
  
  if (!isSupported) {
    return <p>Push notifications not supported</p>;
  }
  
  return (
    <Toggle
      checked={isSubscribed}
      onChange={() => isSubscribed ? unsubscribe() : subscribe()}
    />
  );
}
```

---

## Best Practices Checklist

### Instant Loading
- [ ] Load UI from IndexedDB before any network requests
- [ ] Show cached data immediately, sync in background
- [ ] Use skeleton screens only for truly empty states
- [ ] Prefetch likely-needed data during idle time

### Network Efficiency
- [ ] Delta sync - only fetch what's changed
- [ ] Batch API requests where possible
- [ ] Use WebSocket for real-time, REST for sync
- [ ] Compress payloads (gzip, MessagePack)

### Offline Support
- [ ] Queue all user actions when offline
- [ ] Use Background Sync API for reliability
- [ ] Show clear offline indicators
- [ ] Merge conflicts gracefully

### Socket Management
- [ ] Connect only when app is visible
- [ ] Implement exponential backoff for reconnection
- [ ] Don't rely on socket for message delivery
- [ ] Use socket for ephemeral data (typing, presence)

### Push Notifications
- [ ] Save message to IndexedDB BEFORE showing notification
- [ ] Update badge count in service worker
- [ ] Handle notification clicks properly
- [ ] Don't send push to online users

### Performance
- [ ] Virtualize long message lists
- [ ] Debounce typing indicators (300ms)
- [ ] Batch read receipts (500ms)
- [ ] Lazy load images and media

### User Experience
- [ ] Optimistic UI for all actions
- [ ] Silent reconnection (no spinners)
- [ ] Graceful degradation when offline
- [ ] Clear sync status indicators

---

## Environment Variables

```env
# Push Notifications (generate with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:admin@yourapp.com

# Socket Server
NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.com

# Redis (for multi-instance)
REDIS_URL=redis://localhost:6379
```

---

## Testing Checklist

1. **Instant Load Test**
   - Open app with network throttled to "Slow 3G"
   - UI should appear within 1 second from cache
   - Messages should load from IndexedDB instantly

2. **Offline Test**
   - Enable airplane mode
   - Send a message (should queue)
   - Disable airplane mode
   - Message should send automatically

3. **Background Push Test**
   - Close app (not just minimize)
   - Send message from another device
   - Notification should appear
   - Open app - message should be there (from IndexedDB)

4. **Reconnection Test**
   - Disconnect network while in app
   - Reconnect network
   - Socket should reconnect silently (no UI indication)

5. **Multi-Tab Test**
   - Open app in two tabs
   - Send message in one tab
   - Should appear in other tab via socket
