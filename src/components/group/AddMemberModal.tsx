'use client';

import { useState } from 'react';
import type { GroupRole } from '@/types/group';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (userId: string, role?: GroupRole) => Promise<void>;
  availableUsers: Array<{ id: string; name: string; image?: string }>;
  existingMemberIds: string[];
  canAssignRoles: boolean;
}

export function AddMemberModal({
  isOpen,
  onClose,
  onAdd,
  availableUsers,
  existingMemberIds,
  canAssignRoles,
}: AddMemberModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [role, setRole] = useState<GroupRole>('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredUsers = availableUsers.filter(
    (user) =>
      !existingMemberIds.includes(user.id) &&
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onAdd(selectedUserId, canAssignRoles ? role : undefined);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedUserId(null);
    setRole('member');
    setSearchQuery('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Add Member
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Search Users
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Search by name..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select User
            </label>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-gray-300 dark:border-gray-600">
              {filteredUsers.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-gray-500">
                  No users available to add
                </p>
              ) : (
                filteredUsers.map((user) => (
                  <label
                    key={user.id}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      selectedUserId === user.id
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="selectedUser"
                      checked={selectedUserId === user.id}
                      onChange={() => setSelectedUserId(user.id)}
                      className="h-4 w-4 border-gray-300"
                    />
                    <div className="flex items-center gap-2">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt={user.name}
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-sm font-medium dark:bg-gray-600">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm text-gray-900 dark:text-white">
                        {user.name}
                      </span>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {canAssignRoles && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as GroupRole)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedUserId}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
