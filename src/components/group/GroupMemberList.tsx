'use client';

import { useState } from 'react';
import type { GroupMember, GroupRole } from '@/types/group';

interface GroupMemberListProps {
  members: Array<GroupMember & { user: { id: string; name: string; image?: string; status?: string } }>;
  currentUserId: string;
  isOwner: boolean;
  isAdmin: boolean;
  onUpdateRole: (userId: string, role: GroupRole) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onTransferOwnership: (userId: string) => Promise<void>;
}

export function GroupMemberList({
  members,
  currentUserId,
  isOwner,
  isAdmin,
  onUpdateRole,
  onRemoveMember,
  onTransferOwnership,
}: GroupMemberListProps) {
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [showTransferConfirm, setShowTransferConfirm] = useState<string | null>(null);

  const canManageMembers = isOwner || isAdmin;

  const handleRoleChange = async (userId: string, newRole: GroupRole) => {
    setLoadingUserId(userId);
    try {
      await onUpdateRole(userId, newRole);
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    setLoadingUserId(userId);
    try {
      await onRemoveMember(userId);
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleTransfer = async (userId: string) => {
    setLoadingUserId(userId);
    try {
      await onTransferOwnership(userId);
      setShowTransferConfirm(null);
    } finally {
      setLoadingUserId(null);
    }
  };

  const getRoleBadgeColor = (role: GroupRole) => {
    switch (role) {
      case 'owner':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'admin':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const sortedMembers = [...members].sort((a, b) => {
    const roleOrder = { owner: 0, admin: 1, member: 2 };
    return roleOrder[a.role] - roleOrder[b.role];
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Members ({members.length})
      </h3>

      <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
        {sortedMembers.map((member) => {
          const isCurrentUser = member.user.id === currentUserId;
          const isMemberOwner = member.role === 'owner';
          const canModify = canManageMembers && !isMemberOwner && !isCurrentUser;

          return (
            <div
              key={member.user.id}
              className="flex items-center justify-between border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-gray-700"
            >
              <div className="flex items-center gap-3">
                {member.user.image ? (
                  <img
                    src={member.user.image}
                    alt={member.user.name}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300 text-sm font-medium dark:bg-gray-600">
                    {member.user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {member.user.name}
                      {isCurrentUser && (
                        <span className="ml-1 text-gray-500">(You)</span>
                      )}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBadgeColor(
                        member.role
                      )}`}
                    >
                      {member.role}
                    </span>
                  </div>
                  {member.nickname && (
                    <span className="text-xs text-gray-500">
                      Nickname: {member.nickname}
                    </span>
                  )}
                </div>
              </div>

              {canModify && (
                <div className="flex items-center gap-2">
                  {showTransferConfirm === member.user.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTransfer(member.user.id)}
                        disabled={loadingUserId === member.user.id}
                        className="rounded bg-yellow-500 px-2 py-1 text-xs text-white hover:bg-yellow-600 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setShowTransferConfirm(null)}
                        className="rounded bg-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      {isOwner && (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member.user.id, e.target.value as GroupRole)
                          }
                          disabled={loadingUserId === member.user.id}
                          className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}

                      {isOwner && (
                        <button
                          onClick={() => setShowTransferConfirm(member.user.id)}
                          className="rounded px-2 py-1 text-xs text-yellow-600 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
                          title="Transfer ownership"
                        >
                          👑
                        </button>
                      )}

                      <button
                        onClick={() => handleRemove(member.user.id)}
                        disabled={loadingUserId === member.user.id}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}

              {isCurrentUser && !isMemberOwner && (
                <button
                  onClick={() => handleRemove(member.user.id)}
                  disabled={loadingUserId === member.user.id}
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Leave
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
