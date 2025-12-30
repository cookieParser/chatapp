'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useSession } from 'next-auth/react';
import { Hash, Users, MessageCircle, Plus, Search, BellOff } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useNotificationStore } from '@/store/notificationStore';
import { UnreadBadge } from '@/components/notifications';

interface Participant {
  user: {
    _id: string;
    name: string;
    email: string;
    image?: string;
    status?: string;
  };
  role: string;
  isActive: boolean;
}

interface Conversation {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  image?: string;
  participants: Participant[];
  lastMessage?: {
    content: string;
    createdAt: string;
  };
  lastMessageAt?: string;
}

export function ConversationList() {
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { openChat } = useChatStore();
  const { unreadCounts, mutedConversations } = useNotificationStore();

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    // Refresh every 30 seconds
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const getConversationName = useCallback((conv: Conversation): string => {
    if (conv.name) return conv.name;
    
    // For direct messages, show the other person's name
    if (conv.type === 'direct') {
      const otherParticipant = conv.participants.find(
        p => p.user.email !== session?.user?.email
      );
      return otherParticipant?.user.name || 'Unknown';
    }
    
    return 'Unnamed Conversation';
  }, [session?.user?.email]);

  const getConversationImage = useCallback((conv: Conversation): string | undefined => {
    if (conv.image) return conv.image;
    
    if (conv.type === 'direct') {
      const otherParticipant = conv.participants.find(
        p => p.user.email !== session?.user?.email
      );
      return otherParticipant?.user.image;
    }
    
    return undefined;
  }, [session?.user?.email]);

  const handleOpenChat = useCallback((conv: Conversation) => {
    const name = getConversationName(conv);
    const image = getConversationImage(conv);
    
    // Get the other participant's ID for direct chats
    let participantId: string | undefined;
    if (conv.type === 'direct' && conv.participants) {
      const otherParticipant = conv.participants.find(
        p => p.user.email !== session?.user?.email
      );
      participantId = otherParticipant?.user?._id;
    }
    
    openChat({
      id: conv._id,
      type: conv.type === 'direct' ? 'direct' : 'group',
      name,
      image,
      participantId,
    });
  }, [getConversationName, getConversationImage, openChat, session?.user?.email]);

  const formatTime = useCallback((dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
    return date.toLocaleDateString();
  }, []);

  const filteredConversations = useMemo(() => 
    conversations.filter(conv => {
      const name = getConversationName(conv).toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    }), [conversations, searchQuery, session?.user?.email]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <MessageCircle className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-gray-400 text-sm">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <ConversationItem
              key={conv._id}
              conversation={conv}
              name={getConversationName(conv)}
              image={getConversationImage(conv)}
              unreadCount={unreadCounts.get(conv._id) || 0}
              isMuted={mutedConversations.has(conv._id)}
              lastMessageAt={conv.lastMessageAt}
              lastMessageContent={conv.lastMessage?.content}
              onOpenChat={handleOpenChat}
              formatTime={formatTime}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Memoized conversation item to prevent re-renders when other conversations update
const ConversationItem = memo(function ConversationItem({
  conversation,
  name,
  image,
  unreadCount,
  isMuted,
  lastMessageAt,
  lastMessageContent,
  onOpenChat,
  formatTime,
}: {
  conversation: Conversation;
  name: string;
  image?: string;
  unreadCount: number;
  isMuted: boolean;
  lastMessageAt?: string;
  lastMessageContent?: string;
  onOpenChat: (conv: Conversation) => void;
  formatTime: (dateString?: string) => string;
}) {
  const handleClick = useCallback(() => {
    onOpenChat(conversation);
  }, [onOpenChat, conversation]);

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left hover:bg-gray-800/50 transition-colors"
    >
      {/* Avatar */}
      {image ? (
        <img
          src={image}
          alt={name}
          className="h-12 w-12 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
          {conversation.type === 'direct' ? (
            name.charAt(0).toUpperCase()
          ) : (
            <Users className="h-5 w-5" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-white truncate">{name}</span>
            {isMuted && <BellOff className="h-3 w-3 text-gray-500 flex-shrink-0" />}
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatTime(lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-gray-400 truncate">
            {lastMessageContent || 'No messages yet'}
          </p>
          {unreadCount > 0 && !isMuted && (
            <UnreadBadge count={unreadCount} size="sm" />
          )}
        </div>
      </div>
    </button>
  );
});
