'use client';

import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Users, Plus, LogOut, Settings, Search, BellOff, MessageCircle, Code2, ChevronDown, User, Moon, Sun, Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useChatStore } from '@/store/chatStore';
import { UnreadBadge } from '@/components/notifications';

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Simple client-side cache for conversations
const conversationCache = {
  data: null as any[] | null,
  timestamp: 0,
  isValid() {
    return this.data !== null && Date.now() - this.timestamp < CACHE_DURATION;
  },
  set(data: any[]) {
    this.data = data;
    this.timestamp = Date.now();
  },
  get() {
    return this.isValid() ? this.data : null;
  },
  invalidate() {
    this.data = null;
    this.timestamp = 0;
  },
  // Update a specific conversation's last message without full refetch
  updateLastMessage(conversationId: string, content: string, createdAt: string) {
    if (!this.data) return;
    const index = this.data.findIndex((c: any) => c._id === conversationId);
    if (index !== -1) {
      const conv = { ...this.data[index] };
      conv.lastMessage = { content, createdAt };
      conv.lastMessageAt = createdAt;
      // Move to top of list
      this.data = [conv, ...this.data.filter((c: any) => c._id !== conversationId)];
    }
  }
};

// Export for other components to invalidate cache when needed
export function invalidateConversationCache() {
  conversationCache.invalidate();
}

interface GroupData {
  _id?: string;
  id?: string;
  metadata?: {
    name: string;
    description?: string;
    avatarUrl?: string;
  };
  members?: unknown[];
}

interface User {
  id: string;
  name: string;
  email?: string;
  image?: string;
}

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

const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_EMAIL || 'demo@example.com';
const DEV_NAME = 'Developer';

export function ChatSidebar() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<'chats' | 'groups'>('chats');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [devUser, setDevUser] = useState<User | null>(null);
  const [startingDevChat, setStartingDevChat] = useState(false);
  const { openChat } = useChatStore();
  
  // Form state
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newChatSearchQuery, setNewChatSearchQuery] = useState('');

  const isDevUser = session?.user?.email === DEV_EMAIL;

  const fetchGroups = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        setGroups(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setLoading(false);
    }
  }, [status]);

  const fetchConversations = useCallback(async (forceRefresh = false) => {
    if (status !== 'authenticated') return;
    
    // Use cached data if available and not forcing refresh
    if (!forceRefresh) {
      const cached = conversationCache.get();
      if (cached) {
        setConversations(cached);
        return;
      }
    }
    
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        conversationCache.set(data);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  }, [status]);

  const fetchUsers = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const users = await res.json();
        const filteredUsers = users.filter((u: User) => u.id !== session?.user?.id);
        setAvailableUsers(filteredUsers);
        
        // Find the dev user
        const dev = users.find((u: User) => u.email === DEV_EMAIL);
        if (dev && dev.id !== session?.user?.id) {
          setDevUser(dev);
        }
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, [status, session?.user?.id]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchGroups();
      fetchUsers();
      fetchConversations();
    }
  }, [status, fetchGroups, fetchUsers, fetchConversations]);

  // Handle tab visibility changes - only refetch if cache is stale
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && status === 'authenticated') {
        // Only fetch if cache is invalid (stale or empty)
        if (!conversationCache.isValid()) {
          fetchConversations(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [status, fetchConversations]);

  const handleChatWithDev = async () => {
    if (!devUser) {
      alert('Developer account not found. Please try again later.');
      return;
    }
    
    setStartingDevChat(true);
    try {
      const res = await fetch('/api/conversations/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: devUser.id }),
      });
      
      if (res.ok) {
        const { conversationId } = await res.json();
        openChat({
          id: conversationId,
          type: 'direct',
          name: 'Chat with Dev',
          image: devUser.image,
          participantId: devUser.id,
        });
        fetchConversations(true); // Force refresh after creating new conversation
      }
    } catch (error) {
      console.error('Failed to start chat with dev:', error);
    } finally {
      setStartingDevChat(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedMembers.length === 0) return;

    setCreating(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || undefined,
          memberIds: selectedMembers,
        }),
      });
      if (res.ok) {
        const newGroup = await res.json();
        setGroups((prev) => [newGroup, ...prev]);
        closeModal();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create group');
      }
    } catch (error) {
      alert('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setShowCreateGroup(false);
    setGroupName('');
    setGroupDescription('');
    setSelectedMembers([]);
    setSearchQuery('');
  };

  const closeNewChatModal = () => {
    setShowNewChat(false);
    setNewChatSearchQuery('');
  };

  const handleStartDirectChat = async (user: User) => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          participantIds: [user.id],
        }),
      });
      
      if (res.ok) {
        const conversation = await res.json();
        openChat({
          id: conversation._id || conversation.id,
          type: 'direct',
          name: user.name,
          image: user.image,
          participantId: user.id,
        });
        closeNewChatModal();
        fetchConversations(true); // Force refresh after creating new conversation
      }
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const getGroupId = (g: GroupData) => g.id || g._id || '';
  const getGroupName = (g: GroupData) => g.metadata?.name || 'Unnamed';
  const getMemberCount = (g: GroupData) => g.members?.length || 0;

  const getConversationName = (conv: Conversation): string => {
    if (conv.name) return conv.name;
    if (conv.type === 'direct' && conv.participants) {
      const otherParticipant = conv.participants.find(
        p => p?.user?.email && p.user.email !== session?.user?.email
      );
      // Check if this is a chat with dev
      if (otherParticipant?.user?.email === DEV_EMAIL) {
        return 'Chat with Dev';
      }
      return otherParticipant?.user?.name || 'Unknown';
    }
    return 'Unnamed Conversation';
  };

  const getConversationImage = (conv: Conversation): string | undefined => {
    if (conv.image) return conv.image;
    if (conv.type === 'direct' && conv.participants) {
      const otherParticipant = conv.participants.find(
        p => p?.user?.email && p.user.email !== session?.user?.email
      );
      return otherParticipant?.user?.image;
    }
    return undefined;
  };

  const handleOpenConversation = (conv: Conversation) => {
    // Mark as read when opening
    markConversationAsRead(conv._id);
    
    // Get the other participant's ID for direct chats
    let participantId: string | undefined;
    if (conv.type === 'direct' && conv.participants) {
      const otherParticipant = conv.participants.find(
        p => p?.user?.email && p.user.email !== session?.user?.email
      );
      participantId = otherParticipant?.user?._id;
    }
    
    openChat({
      id: conv._id,
      type: conv.type === 'direct' ? 'direct' : 'group',
      name: getConversationName(conv),
      image: getConversationImage(conv),
      participantId,
    });
  };

  const markConversationAsRead = async (conversationId: string) => {
    try {
      await fetch(`/api/notifications/read/${conversationId}`, {
        method: 'POST',
      });
      // Clear unread count locally
      useNotificationStore.getState().clearUnread(conversationId);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleOpenGroup = (group: GroupData) => {
    openChat({
      id: getGroupId(group),
      type: 'group',
      name: getGroupName(group),
      image: group.metadata?.avatarUrl,
    });
  };

  const initials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?';

  const filteredUsers = useMemo(() => 
    availableUsers.filter((u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase())
    ), [availableUsers, searchQuery]);

  const newChatFilteredUsers = useMemo(() => 
    availableUsers.filter((u) =>
      u.name.toLowerCase().includes(newChatSearchQuery.toLowerCase())
    ), [availableUsers, newChatSearchQuery]);

  return (
    <>
      <aside className="flex h-full w-full md:w-72 lg:w-80 flex-col bg-gradient-to-b from-gray-900 to-gray-950 text-white">
        {/* Top Header with User Dropdown */}
        <div className="px-2 sm:px-3 pt-2 sm:pt-3">
          <UserDropdown 
            user={session?.user}
            initials={initials}
          />
        </div>

        {/* Chat with Dev Button - Shows for all users except the dev */}
        {status === 'authenticated' && !isDevUser && (
          <div className="px-2 sm:px-3 pt-2 sm:pt-3">
            <button
              onClick={handleChatWithDev}
              disabled={startingDevChat || !devUser}
              className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/20"
            >
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/10 flex-shrink-0">
                <Code2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="text-left min-w-0">
                <p className="font-semibold text-sm sm:text-base truncate">{startingDevChat ? 'Starting...' : 'Chat with Dev'}</p>
                <p className="text-xs text-blue-200 truncate">Get help or say hi!</p>
              </div>
            </button>
          </div>
        )}

        {/* Admin Dashboard - Shows only for dev */}
        {status === 'authenticated' && isDevUser && (
          <div className="px-2 sm:px-3 pt-2 sm:pt-3">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 border border-amber-500/30">
              <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30 flex-shrink-0">
                <Code2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="text-left min-w-0">
                <p className="font-semibold text-amber-400 text-sm sm:text-base truncate">Admin Dashboard</p>
                <p className="text-xs text-amber-300/70 truncate">Manage user conversations</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1.5 sm:p-2 mx-2 mt-2 sm:mt-3 bg-gray-800/50 rounded-lg">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'chats'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Chats
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'groups'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Groups
          </button>
        </div>

        {/* Content */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {activeTab === 'chats' ? (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Recent Chats
                </span>
                <button
                  onClick={() => setShowNewChat(true)}
                  className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  title="Start new chat"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {conversations.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                    <MessageCircle className="h-8 w-8 text-gray-600" />
                  </div>
                  <p className="text-gray-400 text-sm">No conversations yet</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <ConversationItem
                    key={conv._id}
                    conversation={conv}
                    currentUserEmail={session?.user?.email}
                    onClick={() => handleOpenConversation(conv)}
                  />
                ))
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Your Groups
                </span>
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  title="Create new group"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                    <Users className="h-8 w-8 text-gray-600" />
                  </div>
                  <p className="text-gray-400 text-sm mb-3">No groups yet</p>
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Create Group
                  </button>
                </div>
              ) : (
                groups.map((group) => (
                  <GroupItem
                    key={getGroupId(group)}
                    id={getGroupId(group)}
                    name={getGroupName(group)}
                    memberCount={getMemberCount(group)}
                    avatarUrl={group.metadata?.avatarUrl}
                    onClick={() => handleOpenGroup(group)}
                  />
                ))
              )}
            </>
          )}
        </nav>
      </aside>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md mx-4 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
              <h2 className="text-xl font-semibold text-white">Create New Group</h2>
              <p className="text-sm text-gray-400 mt-1">Bring people together</p>
            </div>

            <form onSubmit={handleCreateGroup} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Group Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="e.g., Project Team"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  placeholder="What's this group about?"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Add Members <span className="text-red-400">*</span>
                  <span className="ml-2 text-xs text-gray-500">
                    ({selectedMembers.length} selected)
                  </span>
                </label>
                
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Search users..."
                  />
                </div>

                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-700 bg-gray-800/50">
                  {filteredUsers.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">
                      No users found
                    </p>
                  ) : (
                    filteredUsers.map((user) => (
                      <label
                        key={user.id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          selectedMembers.includes(user.id)
                            ? 'bg-blue-600/20'
                            : 'hover:bg-gray-700/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(user.id)}
                          onChange={() => toggleMember(user.id)}
                          className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        {user.image ? (
                          <img src={user.image} alt={user.name} className="h-8 w-8 rounded-full" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-xs font-medium">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm text-white">{user.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !groupName.trim() || selectedMembers.length === 0}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/25"
                >
                  {creating ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeNewChatModal}
        >
          <div
            className="w-full max-w-md mx-4 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
              <h2 className="text-xl font-semibold text-white">New Chat</h2>
              <p className="text-sm text-gray-400 mt-1">Start a conversation with someone</p>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  value={newChatSearchQuery}
                  onChange={(e) => setNewChatSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Search users..."
                  autoFocus
                />
              </div>

              <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-700 bg-gray-800/50">
                {newChatFilteredUsers.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-500">
                    {newChatSearchQuery ? 'No users found' : 'No users available'}
                  </p>
                ) : (
                  newChatFilteredUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleStartDirectChat(user)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition-colors text-left"
                    >
                      {user.image ? (
                        <img src={user.image} alt={user.name} className="h-10 w-10 rounded-full" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-semibold text-white">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{user.name}</p>
                        <p className="text-xs text-gray-500">Click to start chatting</p>
                      </div>
                      <MessageCircle className="h-5 w-5 text-gray-500" />
                    </button>
                  ))
                )}
              </div>

              <button
                onClick={closeNewChatModal}
                className="w-full mt-4 px-4 py-3 rounded-xl text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Memoized GroupItem to prevent re-renders when other groups update
const GroupItem = memo(function GroupItem({
  id,
  name,
  memberCount,
  avatarUrl,
  onClick,
}: {
  id: string;
  name: string;
  memberCount: number;
  avatarUrl?: string;
  onClick?: () => void;
}) {
  const { unreadCounts, mutedConversations } = useNotificationStore();
  const { activeTabId } = useChatStore();
  const unreadCount = unreadCounts.get(id) || 0;
  const isMuted = mutedConversations.has(id);
  const isActive = activeTabId === id;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-gray-800 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
      }`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-semibold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{name}</p>
          {isMuted && <BellOff className="h-3 w-3 text-gray-500" />}
        </div>
        <p className="text-xs text-gray-500">
          {memberCount} member{memberCount !== 1 ? 's' : ''}
        </p>
      </div>
      {unreadCount > 0 && !isMuted && (
        <UnreadBadge count={unreadCount} size="sm" />
      )}
    </button>
  );
});

// Memoized ConversationItem to prevent re-renders when other conversations update
const ConversationItem = memo(function ConversationItem({
  conversation,
  currentUserEmail,
  onClick,
}: {
  conversation: Conversation;
  currentUserEmail?: string | null;
  onClick: () => void;
}) {
  const { unreadCounts, mutedConversations } = useNotificationStore();
  const { activeTabId } = useChatStore();
  const unreadCount = unreadCounts.get(conversation._id) || 0;
  const isMuted = mutedConversations.has(conversation._id);
  const isActive = activeTabId === conversation._id;

  const getName = (): string => {
    if (conversation.name) return conversation.name;
    if (conversation.type === 'direct' && conversation.participants) {
      const otherParticipant = conversation.participants.find(
        p => p?.user?.email && p.user.email !== currentUserEmail
      );
      if (otherParticipant?.user?.email === DEV_EMAIL) {
        return 'Chat with Dev';
      }
      return otherParticipant?.user?.name || 'Unknown';
    }
    return 'Unnamed';
  };

  const getImage = (): string | undefined => {
    if (conversation.image) return conversation.image;
    if (conversation.type === 'direct' && conversation.participants) {
      const otherParticipant = conversation.participants.find(
        p => p?.user?.email && p.user.email !== currentUserEmail
      );
      return otherParticipant?.user?.image;
    }
    return undefined;
  };

  const isDevChat = conversation.type === 'direct' && 
    conversation.participants?.some(p => p?.user?.email === DEV_EMAIL);

  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString();
  };

  const name = getName();
  const image = getImage();

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-gray-800 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
      }`}
    >
      {image ? (
        <img src={image} alt={name} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white ${
          isDevChat 
            ? 'bg-gradient-to-br from-blue-600 to-purple-600' 
            : 'bg-gradient-to-br from-gray-600 to-gray-700'
        }`}>
          {isDevChat ? <Code2 className="h-5 w-5" /> : name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{name}</p>
          {conversation.lastMessageAt && (
            <span className="text-xs text-gray-500 flex-shrink-0">
              {formatTime(conversation.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {conversation.lastMessage ? (
            <p className="text-xs text-gray-500 truncate">
              {conversation.lastMessage.content}
            </p>
          ) : (
            <p className="text-xs text-gray-500 italic">No messages yet</p>
          )}
          {isMuted && <BellOff className="h-3 w-3 text-gray-500 flex-shrink-0" />}
        </div>
      </div>
      {unreadCount > 0 && !isMuted && (
        <UnreadBadge count={unreadCount} size="sm" />
      )}
    </button>
  );
});


// User Dropdown Component
const UserDropdown = memo(function UserDropdown({
  user,
  initials,
}: {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  initials: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleSignOut = () => {
    setIsOpen(false);
    signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-lg hover:bg-gray-800 transition-colors"
      >
        <div className="relative flex-shrink-0">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || 'User'}
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs sm:text-sm font-semibold">
              {initials}
            </div>
          )}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-green-500 border-2 border-gray-900" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs sm:text-sm font-medium truncate">{user?.name || 'User'}</p>
          <p className="text-xs text-gray-500 truncate">Online</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu - Opens downward */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 py-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
          {/* User Info Header */}
          <div className="px-3 py-2 border-b border-gray-700">
            <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email || ''}</p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <User className="h-4 w-4" />
              Profile
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <Bell className="h-4 w-4" />
              Notifications
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-gray-700 py-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
