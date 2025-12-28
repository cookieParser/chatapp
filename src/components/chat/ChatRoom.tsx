'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { Send, MoreVertical } from 'lucide-react';
import { MuteButton } from '@/components/notifications';
import { useNotificationStore } from '@/store/notificationStore';

interface Message {
  _id: string;
  content: string;
  sender: {
    _id: string;
    username?: string;
    name?: string;
    image?: string;
  };
  createdAt: string;
  type: string;
}

interface ChatRoomProps {
  conversationId: string;
  conversationName: string;
  conversationType: 'direct' | 'group' | 'channel';
}

export function ChatRoom({ conversationId, conversationName, conversationType }: ChatRoomProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [mongoUserId, setMongoUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { clearUnread, incrementUnread } = useNotificationStore();

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

    newSocket.on('message:new', (message: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) {
          return prev;
        }
        return [...prev, message];
      });
      
      // Increment unread if message is from someone else
      if (message.sender._id !== mongoUserId) {
        incrementUnread(conversationId);
      }
    });

    newSocket.on('typing:start', ({ username }: { username: string }) => {
      setTypingUsers((prev) => [...new Set([...prev, username])]);
    });

    newSocket.on('typing:stop', ({ username }: { username: string }) => {
      setTypingUsers((prev) => prev.filter((u) => u !== username));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [session?.user, mongoUserId, conversationId, incrementUnread]);

  // Join conversation and load messages
  useEffect(() => {
    if (!socket || !isConnected || !conversationId) return;

    const loadMessages = async () => {
      setLoading(true);
      try {
        // Join the conversation room
        socket.emit('conversation:join', conversationId);

        // Load existing messages
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (res.ok) {
          const data = await res.json();
          const messageList = Array.isArray(data) ? data : data.messages || [];
          setMessages(messageList);
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
  }, [socket, isConnected, conversationId, clearUnread]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    if (!newMessage.trim() || !socket || !conversationId) return;

    socket.emit(
      'message:send',
      {
        conversationId,
        content: newMessage.trim(),
        type: 'text',
      },
      (response: { success: boolean; message?: Message; error?: string }) => {
        if (response.success && response.message) {
          setMessages((prev) => {
            if (prev.some((m) => m._id === response.message!._id)) {
              return prev;
            }
            return [...prev, response.message!];
          });
        }
      }
    );

    setNewMessage('');
    
    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socket.emit('typing:stop', conversationId);
  }, [newMessage, socket, conversationId]);

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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-white">{conversationName}</h1>
          <p className="text-xs text-gray-500">
            {isConnected ? (
              <span className="text-green-400">● Connected</span>
            ) : (
              <span className="text-yellow-400">● Connecting...</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MuteButton conversationId={conversationId} />
          <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-gray-400">No messages yet</p>
            <p className="text-sm text-gray-500 mt-1">Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.sender._id === mongoUserId;
            const senderName = message.sender.name || message.sender.username || 'Unknown';
            
            return (
              <div
                key={message._id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] sm:max-w-[60%] rounded-2xl px-4 py-2 ${
                    isOwn
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-800 text-white rounded-bl-md'
                  }`}
                >
                  {!isOwn && conversationType !== 'direct' && (
                    <p className="text-xs font-medium text-blue-400 mb-1">{senderName}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                  <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-500'}`}>
                    {formatTime(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        
        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>{typingUsers.join(', ')} typing...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 sm:p-4 border-t border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            disabled={!isConnected}
          />
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || !isConnected}
            className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white transition-colors"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
