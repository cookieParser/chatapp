'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { Hash, Users, Send, Smile, Paperclip, MoreVertical } from 'lucide-react';
import { useNotificationContext } from '@/components/notifications';
import { MuteButton } from '@/components/notifications';

interface Message {
  _id: string;
  content: string;
  sender: {
    _id: string;
    username: string;
    name?: string;
    image?: string;
  };
  createdAt: string;
  type: string;
}

interface ChatRoomProps {
  channelId?: string;
  groupId?: string;
  type: 'channel' | 'group';
}

export function ChatRoom({ channelId, groupId, type }: ChatRoomProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  
  // Notification context
  const { handleNewMessage, markAsRead, isConversationMuted } = useNotificationContext();

  const roomId = channelId || groupId || '';
  const roomName = channelId || 'Group Chat';
  
  // Keep ref in sync with state
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Initialize socket connection
  useEffect(() => {
    if (!session?.user) return;

    // First, get the MongoDB user ID
    const initSocket = async () => {
      try {
        // Get current user's MongoDB ID
        const userRes = await fetch('/api/users/me');
        const userData = userRes.ok ? await userRes.json() : null;
        const mongoUserId = userData?.id || session.user.id;

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
            // Avoid duplicates by checking if message already exists
            if (prev.some((m) => m._id === message._id)) {
              return prev;
            }
            return [...prev, message];
          });
          
          // Trigger notification if message is from someone else
          if (message.sender._id !== session?.user?.id && conversationIdRef.current) {
            const senderName = message.sender.name || message.sender.username || 'Someone';
            handleNewMessage(conversationIdRef.current, senderName, message.content);
          }
        });

        newSocket.on('typing:start', ({ username }) => {
          setTypingUsers((prev) => [...new Set([...prev, username])]);
        });

        newSocket.on('typing:stop', ({ username }) => {
          setTypingUsers((prev) => prev.filter((u) => u !== username));
        });

        setSocket(newSocket);
      } catch (error) {
        console.error('Failed to initialize socket:', error);
      }
    };

    initSocket();

    return () => {
      socket?.disconnect();
    };
  }, [session?.user]);

  // Join conversation room and load messages
  useEffect(() => {
    if (!socket || !isConnected || !roomId) return;

    const loadOrCreateConversation = async () => {
      try {
        // For channels, we'll use a simple approach - create/get conversation by channel name
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: type === 'channel' ? 'channel' : 'group',
            name: roomId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setConversationId(data._id || data.id);
          socket.emit('conversation:join', data._id || data.id);

          // Load existing messages
          const messagesRes = await fetch(`/api/conversations/${data._id || data.id}/messages`);
          if (messagesRes.ok) {
            const messagesData = await messagesRes.json();
            // Deduplicate messages by _id
            const uniqueMessages = messagesData.filter(
              (msg: Message, idx: number, arr: Message[]) =>
                arr.findIndex((m) => m._id === msg._id) === idx
            );
            setMessages(uniqueMessages);
          }
        }
      } catch (error) {
        console.error('Failed to load conversation:', error);
      }
    };

    loadOrCreateConversation();

    return () => {
      if (conversationId) {
        socket.emit('conversation:leave', conversationId);
      }
    };
  }, [socket, isConnected, roomId, type]);

  // Auto-scroll to bottom and mark as read
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Mark conversation as read when viewing messages
    if (conversationId && messages.length > 0 && document.hasFocus()) {
      markAsRead(conversationId);
    }
  }, [messages, conversationId, markAsRead]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !socket || !conversationId) return;

    socket.emit(
      'message:send',
      {
        conversationId,
        content: newMessage.trim(),
        type: 'text',
      },
      (response: any) => {
        if (response.success && response.message) {
          setMessages((prev) => {
            // Avoid duplicates by checking if message already exists
            if (prev.some((m) => m._id === response.message._id)) {
              return prev;
            }
            return [...prev, response.message];
          });
        }
      }
    );

    setNewMessage('');
    
    // Stop typing indicator
    socket.emit('typing:stop', conversationId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
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

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', conversationId);
    }, 2000);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups: { [key: string]: Message[] }, message) => {
    const date = formatDate(message.createdAt);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800">
            {type === 'channel' ? (
              <Hash className="h-5 w-5 text-gray-400" />
            ) : (
              <Users className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">{roomName}</h1>
            <p className="text-sm text-gray-500">
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  Connecting...
                </span>
              )}
            </p>
          </div>
        </div>
        <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
          <MoreVertical className="h-5 w-5" />
        </button>
        {conversationId && (
          <MuteButton conversationId={conversationId} />
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              {type === 'channel' ? (
                <Hash className="h-10 w-10 text-gray-600" />
              ) : (
                <Users className="h-10 w-10 text-gray-600" />
              )}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Welcome to #{roomName}
            </h2>
            <p className="text-gray-500 max-w-md">
              This is the start of the conversation. Send a message to get things going!
            </p>
          </div>
        ) : (
          Object.entries(groupedMessages).map(([date, dateMessages]) => (
            <div key={date}>
              {/* Date Separator */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs font-medium text-gray-500 px-2">{date}</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>

              {/* Messages for this date */}
              {dateMessages.map((message, index) => {
                const isOwn = message.sender._id === session?.user?.id;
                const showAvatar =
                  index === 0 ||
                  dateMessages[index - 1]?.sender._id !== message.sender._id;

                return (
                  <div
                    key={`${message._id}-${index}`}
                    className={`flex gap-3 mb-1 ${showAvatar ? 'mt-4' : ''}`}
                  >
                    {/* Avatar */}
                    <div className="w-10 flex-shrink-0">
                      {showAvatar && (
                        message.sender.image ? (
                          <img
                            src={message.sender.image}
                            alt={message.sender.username}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-semibold text-white">
                            {(message.sender.username || message.sender.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )
                      )}
                    </div>

                    {/* Message Content */}
                    <div className="flex-1 min-w-0">
                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-white">
                            {message.sender.username || message.sender.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(message.createdAt)}
                          </span>
                        </div>
                      )}
                      <p className="text-gray-300 break-words">{message.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-4">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>
              {typingUsers.length === 1
                ? `${typingUsers[0]} is typing...`
                : `${typingUsers.length} people are typing...`}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
          <button className="p-1 text-gray-400 hover:text-white transition-colors">
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyPress={handleKeyPress}
            placeholder={`Message #${roomName}`}
            className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none"
          />
          <button className="p-1 text-gray-400 hover:text-white transition-colors">
            <Smile className="h-5 w-5" />
          </button>
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || !isConnected}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
