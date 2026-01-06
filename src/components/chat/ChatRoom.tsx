'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { Send, MoreVertical, X, ArrowLeft } from 'lucide-react';
import { MuteButton } from '@/components/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useMessageStore, generateTempId, OptimisticMessage, useUserCacheStore } from '@/store';
import { useChatStore } from '@/store/chatStore';
import { MessageStatus } from '@/types';
import { MinimalMessagePayload, PresencePayload } from '@/lib/socket/types';
import { VirtualizedMessageList } from './VirtualizedMessageList';
import { invalidateConversationCache } from './ChatSidebar';
import { PAGINATION } from '@/lib/constants';

type Message = OptimisticMessage;

interface ChatRoomProps {
  conversationId: string;
  conversationName: string;
  conversationType: 'direct' | 'group' | 'channel';
  otherUserId?: string; // For direct chats, the other user's ID
}

export function ChatRoom({ conversationId, conversationName, conversationType, otherUserId: propOtherUserId }: ChatRoomProps) {
  const { data: session } = useSession();
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState<boolean | null>(null);
  const [otherUserLastSeen, setOtherUserLastSeen] = useState<string | null>(null);
  const [resolvedOtherUserId, setResolvedOtherUserId] = useState<string | null>(propOtherUserId || null);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [mongoUserId, setMongoUserId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { clearUnread, incrementUnread } = useNotificationStore();
  
  // Use message store for optimistic updates
  const {
    messagesByConversation,
    addOptimisticMessage,
    confirmMessage,
    failMessage,
    retryMessage,
    setMessages,
    addIncomingMessage,
    markMessageDeleted,
    removeMessage,
  } = useMessageStore();
  
  // User cache for resolving sender info from minimal payloads
  const { getUser, setUser, fetchUser } = useUserCacheStore();
  
  const messages = messagesByConversation[conversationId] || [];

  // Get MongoDB user ID
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const res = await fetch('/api/users/me');
        if (res.ok) {
          const data = await res.json();
          setMongoUserId(data.id);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      }
    };
    
    if (session?.user) {
      fetchUserId();
    }
  }, [session?.user]);

  // Fetch other user's ID for direct chats if not provided
  useEffect(() => {
    if (conversationType !== 'direct' || propOtherUserId || !session?.user?.email) return;
    
    const fetchOtherUserId = async () => {
      try {
        console.log('[Presence] Fetching conversation for other user ID...');
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (res.ok) {
          const conversation = await res.json();
          console.log('[Presence] Conversation data:', conversation);
          if (conversation.participants) {
            const otherParticipant = conversation.participants.find(
              (p: any) => p?.user?.email && p.user.email !== session.user?.email
            );
            console.log('[Presence] Other participant:', otherParticipant);
            if (otherParticipant?.user?._id) {
              console.log('[Presence] Setting resolvedOtherUserId:', otherParticipant.user._id);
              setResolvedOtherUserId(otherParticipant.user._id);
            }
          }
        } else {
          console.error('[Presence] Failed to fetch conversation:', res.status);
        }
      } catch (error) {
        console.error('Failed to fetch conversation for presence:', error);
      }
    };
    
    fetchOtherUserId();
  }, [conversationId, conversationType, propOtherUserId, session?.user?.email]);

  // Update resolved ID when prop changes
  useEffect(() => {
    if (propOtherUserId) {
      setResolvedOtherUserId(propOtherUserId);
    }
  }, [propOtherUserId]);

  // Initialize socket connection
  useEffect(() => {
    if (!session?.user || !mongoUserId) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    
    const newSocket = io(socketUrl, {
      auth: {
        userId: mongoUserId,
        username: session.user.name || session.user.email,
      },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    newSocket.on('message:new', async (message: MinimalMessagePayload) => {
      // Resolve sender info from cache or fetch
      let sender = getUser(message.senderId);
      if (!sender) {
        sender = await fetchUser(message.senderId);
      }
      
      // Add incoming message with resolved sender info
      addIncomingMessage(conversationId, {
        _id: message.messageId,
        tempId: message.messageId,
        content: message.content,
        sender: sender || { _id: message.senderId },
        createdAt: message.createdAt,
        type: message.type || 'text',
        status: 'delivered' as MessageStatus,
        replyTo: message.replyToId,
      });
      
      // Increment unread if message is from someone else
      if (message.senderId !== mongoUserId) {
        incrementUnread(conversationId);
      }
      
      // Invalidate conversation cache so sidebar updates on next view
      invalidateConversationCache();
    });

    newSocket.on('message:deleted', ({ messageId }: { messageId: string }) => {
      markMessageDeleted(conversationId, messageId);
    });

    newSocket.on('typing:start', ({ username }: { username: string }) => {
      setTypingUsers((prev) => [...new Set([...prev, username])]);
    });

    newSocket.on('typing:stop', ({ username }: { username: string }) => {
      setTypingUsers((prev) => prev.filter((u) => u !== username));
    });

    // Handle presence updates for direct chats
    // Note: These handlers use refs to get the latest resolvedOtherUserId
    newSocket.on('presence:update', (data: PresencePayload) => {
      // We'll handle this in a separate effect that can access resolvedOtherUserId
    });

    newSocket.on('presence:bulk', (data: PresencePayload[]) => {
      // We'll handle this in a separate effect that can access resolvedOtherUserId
    });

    newSocket.on('user:online', (userId: string) => {
      // We'll handle this in a separate effect that can access resolvedOtherUserId
    });

    newSocket.on('user:offline', (userId: string) => {
      // We'll handle this in a separate effect that can access resolvedOtherUserId
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [session?.user, mongoUserId, conversationId, incrementUnread, getUser, fetchUser, addIncomingMessage]);

  // Fetch initial presence status from API
  useEffect(() => {
    if (!resolvedOtherUserId || conversationType !== 'direct') return;

    const fetchInitialPresence = async () => {
      try {
        const res = await fetch(`/api/users/presence?userIds=${resolvedOtherUserId}`);
        if (res.ok) {
          const data = await res.json();
          const userPresence = data.presence?.find((p: any) => p.userId === resolvedOtherUserId);
          if (userPresence) {
            setOtherUserOnline(userPresence.status === 'online');
            setOtherUserLastSeen(userPresence.lastSeen);
          }
        }
      } catch (error) {
        console.error('Failed to fetch initial presence:', error);
        // Keep showing offline as fallback
        setOtherUserOnline(false);
      }
    };

    fetchInitialPresence();
  }, [resolvedOtherUserId, conversationType]);

  // Handle presence events - separate effect to access resolvedOtherUserId
  useEffect(() => {
    if (!socket || !resolvedOtherUserId) return;

    console.log('[Presence] Setting up presence handlers for user:', resolvedOtherUserId);

    const handlePresenceUpdate = (data: PresencePayload) => {
      console.log('[Presence] Received presence:update:', data);
      if (data.userId === resolvedOtherUserId) {
        setOtherUserOnline(data.status === 'online');
        setOtherUserLastSeen(data.lastSeen);
      }
    };

    const handlePresenceBulk = (data: PresencePayload[]) => {
      console.log('[Presence] Received presence:bulk:', data);
      const otherUserPresence = data.find(p => p.userId === resolvedOtherUserId);
      if (otherUserPresence) {
        console.log('[Presence] Found other user presence:', otherUserPresence);
        setOtherUserOnline(otherUserPresence.status === 'online');
        setOtherUserLastSeen(otherUserPresence.lastSeen);
      }
    };

    const handleUserOnline = (userId: string) => {
      console.log('[Presence] Received user:online:', userId);
      if (userId === resolvedOtherUserId) {
        setOtherUserOnline(true);
      }
    };

    const handleUserOffline = (userId: string) => {
      console.log('[Presence] Received user:offline:', userId);
      if (userId === resolvedOtherUserId) {
        setOtherUserOnline(false);
        setOtherUserLastSeen(new Date().toISOString());
      }
    };

    socket.on('presence:update', handlePresenceUpdate);
    socket.on('presence:bulk', handlePresenceBulk);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);

    // Subscribe to presence after handlers are set up
    if (isConnected && conversationType === 'direct') {
      console.log('[Presence] Subscribing to presence for user:', resolvedOtherUserId);
      socket.emit('presence:subscribe', [resolvedOtherUserId]);
    }

    return () => {
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('presence:bulk', handlePresenceBulk);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      
      if (isConnected && conversationType === 'direct') {
        console.log('[Presence] Unsubscribing from presence for user:', resolvedOtherUserId);
        socket.emit('presence:unsubscribe', [resolvedOtherUserId]);
      }
    };
  }, [socket, resolvedOtherUserId, isConnected, conversationType]);

  // Remove the separate subscription effect since it's now combined above

  // Join conversation and load messages
  useEffect(() => {
    if (!socket || !isConnected || !conversationId) return;

    const loadMessages = async () => {
      setLoading(true);
      // Reset pagination state for new conversation
      setHasMore(true);
      setPrevCursor(null);
      
      try {
        // Join the conversation room
        socket.emit('conversation:join', conversationId);

        // Load existing messages (latest first)
        const res = await fetch(`/api/conversations/${conversationId}/messages?limit=${PAGINATION.DEFAULT_PAGE_SIZE}`);
        if (res.ok) {
          const data = await res.json();
          const messageList = Array.isArray(data) ? data : data.messages || [];
          
          // Store pagination info
          if (data.pagination) {
            setHasMore(data.pagination.hasMore);
            setPrevCursor(data.pagination.prevCursor);
          }
          
          // Cache sender info from loaded messages
          const uniqueSenders = new Map();
          messageList.forEach((msg: Message) => {
            if (msg.sender && msg.sender._id && !uniqueSenders.has(msg.sender._id)) {
              uniqueSenders.set(msg.sender._id, {
                _id: msg.sender._id,
                username: msg.sender.username,
                name: msg.sender.name,
                image: msg.sender.image,
              });
            }
          });
          uniqueSenders.forEach((sender) => setUser(sender));
          
          // Convert to OptimisticMessage format
          const formattedMessages: OptimisticMessage[] = messageList.map((msg: Message) => ({
            ...msg,
            tempId: msg._id,
            status: 'delivered' as MessageStatus,
          }));
          setMessages(conversationId, formattedMessages);
        }
        
        // Mark as read
        clearUnread(conversationId);
        await fetch(`/api/notifications/read/${conversationId}`, { method: 'POST' });
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();

    return () => {
      socket.emit('conversation:leave', conversationId);
    };
  }, [socket, isConnected, conversationId, clearUnread, setMessages, setUser]);

  // Load older messages when scrolling up
  const handleLoadMore = useCallback(async () => {
    if (!conversationId || !hasMore || isLoadingMore || !prevCursor) return;
    
    setIsLoadingMore(true);
    
    try {
      const params = new URLSearchParams({
        limit: String(PAGINATION.DEFAULT_PAGE_SIZE),
        cursor: prevCursor,
        direction: 'older',
      });
      
      const res = await fetch(`/api/conversations/${conversationId}/messages?${params}`);
      if (res.ok) {
        const data = await res.json();
        const olderMessages = Array.isArray(data) ? data : data.messages || [];
        
        if (olderMessages.length > 0) {
          // Update pagination info
          if (data.pagination) {
            setHasMore(data.pagination.hasMore);
            setPrevCursor(data.pagination.prevCursor);
          }
          
          // Cache sender info
          const uniqueSenders = new Map();
          olderMessages.forEach((msg: Message) => {
            if (msg.sender && msg.sender._id && !uniqueSenders.has(msg.sender._id)) {
              uniqueSenders.set(msg.sender._id, {
                _id: msg.sender._id,
                username: msg.sender.username,
                name: msg.sender.name,
                image: msg.sender.image,
              });
            }
          });
          uniqueSenders.forEach((sender) => setUser(sender));
          
          // Prepend older messages
          const formattedMessages: OptimisticMessage[] = olderMessages.map((msg: Message) => ({
            ...msg,
            tempId: msg._id,
            status: 'delivered' as MessageStatus,
          }));
          
          // Get current messages and prepend older ones
          const currentMessages = messagesByConversation[conversationId] || [];
          const existingIds = new Set(currentMessages.map((m) => m._id));
          const newMessages = formattedMessages.filter((m) => !existingIds.has(m._id));
          setMessages(conversationId, [...newMessages, ...currentMessages]);
        }
      }
    } catch (error) {
      console.error('Failed to load older messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, hasMore, isLoadingMore, prevCursor, messagesByConversation, setMessages, setUser]);

  // Mark as read when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      if (conversationId) {
        clearUnread(conversationId);
        fetch(`/api/notifications/read/${conversationId}`, { method: 'POST' });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [conversationId, clearUnread]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !socket || !conversationId || !mongoUserId || !session?.user) return;

    const tempId = generateTempId();
    const messageContent = newMessage.trim();
    
    // Create optimistic message
    const optimisticMessage: OptimisticMessage = {
      _id: tempId,
      tempId,
      content: messageContent,
      sender: {
        _id: mongoUserId,
        username: session.user.name || session.user.email || undefined,
        name: session.user.name || undefined,
        image: session.user.image || undefined,
      },
      createdAt: new Date().toISOString(),
      type: 'text',
      status: 'sending',
      replyTo: replyingTo?._id,
      replyToMessage: replyingTo ? {
        _id: replyingTo._id,
        content: replyingTo.content,
        sender: replyingTo.sender,
        isDeleted: replyingTo.isDeleted,
      } : undefined,
    };

    // Add optimistic message immediately
    addOptimisticMessage(conversationId, optimisticMessage);

    // Clear input immediately for better UX
    setNewMessage('');
    setReplyingTo(null);
    
    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socket.emit('typing:stop', conversationId);

    // Send to server
    socket.emit(
      'message:send',
      {
        conversationId,
        content: messageContent,
        type: 'text',
        replyToId: replyingTo?._id,
      },
      (response: { success: boolean; message?: Message; error?: string }) => {
        if (response.success && response.message) {
          // Confirm the optimistic message with server data
          confirmMessage(conversationId, tempId, {
            ...response.message,
            tempId,
            status: 'sent',
          });
        } else {
          // Mark message as failed
          failMessage(conversationId, tempId, response.error || 'Failed to send message');
        }
      }
    );

    // Set a timeout for server response
    setTimeout(() => {
      const currentMessages = useMessageStore.getState().messagesByConversation[conversationId] || [];
      const msg = currentMessages.find((m) => m.tempId === tempId);
      if (msg && msg.status === 'sending') {
        failMessage(conversationId, tempId, 'Message timed out');
      }
    }, 30000); // 30 second timeout
  }, [newMessage, socket, conversationId, replyingTo, mongoUserId, session?.user, addOptimisticMessage, confirmMessage, failMessage]);

  const handleDeleteMessage = useCallback((messageId: string) => {
    if (!socket || !conversationId) return;

    socket.emit(
      'message:delete',
      { messageId, conversationId },
      (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          console.error('Failed to delete message:', response.error);
        }
      }
    );
  }, [socket, conversationId]);

  const handleRetryMessage = useCallback((tempId: string) => {
    if (!socket || !conversationId) return;

    const message = retryMessage(conversationId, tempId);
    if (!message) return;

    socket.emit(
      'message:send',
      {
        conversationId,
        content: message.content,
        type: message.type,
        replyToId: message.replyTo,
      },
      (response: { success: boolean; message?: Message; error?: string }) => {
        if (response.success && response.message) {
          confirmMessage(conversationId, tempId, {
            ...response.message,
            tempId,
            status: 'sent',
          });
        } else {
          failMessage(conversationId, tempId, response.error || 'Failed to send message');
        }
      }
    );
  }, [socket, conversationId, retryMessage, confirmMessage, failMessage]);

  const handleDiscardMessage = useCallback((tempId: string) => {
    removeMessage(conversationId, tempId);
  }, [conversationId, removeMessage]);

  const handleReply = useCallback((message: Message) => {
    setReplyingTo(message);
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTyping = () => {
    if (!socket || !conversationId) return;

    socket.emit('typing:start', conversationId);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', conversationId);
    }, 2000);
  };

  // Helper to format last seen time
  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'Offline';
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Last seen just now';
    if (diffMins < 60) return `Last seen ${diffMins}m ago`;
    if (diffHours < 24) return `Last seen ${diffHours}h ago`;
    if (diffDays < 7) return `Last seen ${diffDays}d ago`;
    return `Last seen ${date.toLocaleDateString()}`;
  };

  // Determine what status to show
  const renderStatus = () => {
    // For direct chats, show the other user's online status
    if (conversationType === 'direct') {
      // Show offline as default while loading or connecting
      if (!isConnected || !resolvedOtherUserId || otherUserOnline === null) {
        return <span className="text-gray-400">● Offline</span>;
      }
      if (otherUserOnline) {
        return <span className="text-green-400">● Online</span>;
      }
      return <span className="text-gray-400">● {formatLastSeen(otherUserLastSeen)}</span>;
    }
    
    // For groups/channels, don't show connection status
    return null;
  };

  const { closeChat } = useChatStore();

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Back button - mobile only */}
          <button
            onClick={() => closeChat(conversationId)}
            className="md:hidden p-2 -ml-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {/* Avatar */}
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-xs sm:text-sm">
              {conversationName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-lg font-semibold text-white truncate">{conversationName}</h1>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              {renderStatus()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <MuteButton conversationId={conversationId} />
          <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Virtualized Messages */}
      <VirtualizedMessageList
        key={conversationId}
        messages={messages}
        currentUserId={mongoUserId}
        conversationType={conversationType}
        isLoading={loading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        typingUsers={typingUsers}
        onReply={handleReply}
        onDelete={handleDeleteMessage}
        onRetry={handleRetryMessage}
        onDiscard={handleDiscardMessage}
        onLoadMore={handleLoadMore}
      />

      {/* Input */}
      <div className="p-2 sm:p-4 border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm">
        {/* Reply preview */}
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between bg-gray-800/80 rounded-lg px-3 py-2 border-l-2 border-blue-500">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-blue-400 font-medium">
                Replying to {replyingTo.sender.name || replyingTo.sender.username || 'Unknown'}
              </p>
              <p className="text-sm text-gray-400 truncate">{replyingTo.content}</p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="ml-2 p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyPress={handleKeyPress}
            placeholder={replyingTo ? 'Type your reply...' : 'Type a message...'}
            className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-800/80 border border-gray-700/50 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-gray-800 text-sm transition-all"
            disabled={!isConnected}
          />
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || !isConnected}
            className="p-2.5 sm:p-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-white transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 disabled:shadow-none"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
