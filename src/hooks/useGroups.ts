import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import type {
  Group,
  CreateGroupInput,
  UpdateGroupInput,
  AddMemberInput,
  UpdateMemberInput,
  GroupRole,
} from '@/types/group';

interface UseGroupsReturn {
  groups: Group[];
  currentGroup: Group | null;
  loading: boolean;
  error: string | null;
  fetchGroups: () => Promise<void>;
  fetchGroup: (groupId: string) => Promise<void>;
  createGroup: (input: CreateGroupInput) => Promise<Group>;
  updateGroup: (groupId: string, input: UpdateGroupInput) => Promise<Group>;
  deleteGroup: (groupId: string) => Promise<void>;
  addMember: (groupId: string, input: AddMemberInput) => Promise<Group>;
  removeMember: (groupId: string, userId: string) => Promise<Group>;
  updateMember: (groupId: string, userId: string, input: UpdateMemberInput) => Promise<Group>;
  transferOwnership: (groupId: string, newOwnerId: string) => Promise<Group>;
  leaveGroup: (groupId: string) => Promise<void>;
  clearError: () => void;
}

export function useGroups(): UseGroupsReturn {
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Group[]>('/groups');
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch groups');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGroup = useCallback(async (groupId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Group>(`/groups/${groupId}`);
      setCurrentGroup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch group');
    } finally {
      setLoading(false);
    }
  }, []);

  const createGroup = useCallback(async (input: CreateGroupInput): Promise<Group> => {
    setLoading(true);
    setError(null);
    try {
      const group = await api.post<Group>('/groups', input);
      setGroups((prev) => [group, ...prev]);
      return group;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create group';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateGroup = useCallback(async (groupId: string, input: UpdateGroupInput): Promise<Group> => {
    setLoading(true);
    setError(null);
    try {
      const group = await api.patch<Group>(`/groups/${groupId}`, input);
      setGroups((prev) => prev.map((g) => (g.id === groupId ? group : g)));
      if (currentGroup?.id === groupId) {
        setCurrentGroup(group);
      }
      return group;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update group';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup?.id]);

  const deleteGroup = useCallback(async (groupId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/groups/${groupId}`);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (currentGroup?.id === groupId) {
        setCurrentGroup(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete group';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup?.id]);

  const addMember = useCallback(async (groupId: string, input: AddMemberInput): Promise<Group> => {
    setLoading(true);
    setError(null);
    try {
      const group = await api.post<Group>(`/groups/${groupId}/members`, input);
      setGroups((prev) => prev.map((g) => (g.id === groupId ? group : g)));
      if (currentGroup?.id === groupId) {
        setCurrentGroup(group);
      }
      return group;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add member';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup?.id]);

  const removeMember = useCallback(async (groupId: string, userId: string): Promise<Group> => {
    setLoading(true);
    setError(null);
    try {
      const group = await api.delete<Group>(`/groups/${groupId}/members/${userId}`);
      setGroups((prev) => prev.map((g) => (g.id === groupId ? group : g)));
      if (currentGroup?.id === groupId) {
        setCurrentGroup(group);
      }
      return group;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove member';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup?.id]);

  const updateMember = useCallback(async (
    groupId: string,
    userId: string,
    input: UpdateMemberInput
  ): Promise<Group> => {
    setLoading(true);
    setError(null);
    try {
      const group = await api.patch<Group>(`/groups/${groupId}/members/${userId}`, input);
      setGroups((prev) => prev.map((g) => (g.id === groupId ? group : g)));
      if (currentGroup?.id === groupId) {
        setCurrentGroup(group);
      }
      return group;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update member';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup?.id]);

  const transferOwnership = useCallback(async (groupId: string, newOwnerId: string): Promise<Group> => {
    setLoading(true);
    setError(null);
    try {
      const group = await api.post<Group>(`/groups/${groupId}/transfer-ownership`, { newOwnerId });
      setGroups((prev) => prev.map((g) => (g.id === groupId ? group : g)));
      if (currentGroup?.id === groupId) {
        setCurrentGroup(group);
      }
      return group;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to transfer ownership';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup?.id]);

  const leaveGroup = useCallback(async (groupId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/groups/${groupId}/leave`);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (currentGroup?.id === groupId) {
        setCurrentGroup(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave group';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentGroup?.id]);

  return {
    groups,
    currentGroup,
    loading,
    error,
    fetchGroups,
    fetchGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember,
    updateMember,
    transferOwnership,
    leaveGroup,
    clearError,
  };
}
