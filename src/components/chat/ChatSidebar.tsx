'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Hash, Users, Plus, LogOut, Settings, Search, ChevronDown, BellOff } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { UnreadBadge } from '@/components/notifications';

interface GroupData {
  _id?: string;
  id?: string;
  metadata?: {
    name: string;
    description?: string;
    avatarUrl?: string;
  };
  members?: any[];
}

interface User {
  id: string;
  name: string;
  image?: string;
}

export function ChatSidebar() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<'channels' | 'groups'>('channels');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  
  // Form state
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const fetchUsers = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const users = await res.json();
        setAvailableUsers(users.filter((u: User) => u.id !== session?.user?.id));
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, [status, session?.user?.id]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchGroups();
      fetchUsers();
    }
  }, [status, fetchGroups, fetchUsers]);

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

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const getGroupId = (g: GroupData) => g.id || g._id || '';
  const getGroupName = (g: GroupData) => g.metadata?.name || 'Unnamed';
  const getMemberCount = (g: GroupData) => g.members?.length || 0;

  const initials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?';

  const filteredUsers = availableUsers.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <aside className="flex h-full w-80 flex-col bg-gradient-to-b from-gray-900 to-gray-950 text-white">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            ChatApp
          </h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-2 mx-2 mt-2 bg-gray-800/50 rounded-lg">
          <button
            onClick={() => setActiveTab('channels')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'channels'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <Hash className="h-4 w-4" />
            Channels
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'groups'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <Users className="h-4 w-4" />
            Groups
          </button>
        </div>

        {/* Content */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {activeTab === 'channels' ? (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Channels
                </span>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </div>
              <ChannelItem name="general" active />
              <ChannelItem name="random" />
              <ChannelItem name="announcements" />
              <ChannelItem name="help" />
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
                  />
                ))
              )}
            </>
          )}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors">
            <div className="relative">
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
              )}
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-gray-900" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session?.user?.name || 'User'}</p>
              <p className="text-xs text-gray-500 truncate">Online</p>
            </div>
            <div className="flex gap-1">
              <button className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="p-2 rounded-md text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
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
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-800 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
              <h2 className="text-xl font-semibold text-white">Create New Group</h2>
              <p className="text-sm text-gray-400 mt-1">Bring people together</p>
            </div>

            {/* Modal Body */}
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
                
                {/* Search */}
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

                {/* User List */}
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

              {/* Actions */}
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
    </>
  );
}

function ChannelItem({ name, active }: { name: string; active?: boolean }) {
  return (
    <a
      href={`/channel/${name}`}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        active
          ? 'bg-gray-800 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
      }`}
    >
      <Hash className="h-5 w-5 text-gray-500" />
      <span className="text-sm font-medium">{name}</span>
    </a>
  );
}

function GroupItem({
  id,
  name,
  memberCount,
  avatarUrl,
}: {
  id: string;
  name: string;
  memberCount: number;
  avatarUrl?: string;
}) {
  const { unreadCounts, mutedConversations } = useNotificationStore();
  const unreadCount = unreadCounts.get(id) || 0;
  const isMuted = mutedConversations.has(id);

  return (
    <a
      href={`/group/${id}`}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-semibold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
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
    </a>
  );
}
