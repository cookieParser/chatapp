'use client';

import { use, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ChatRoom } from '@/components/chat/ChatRoom';

interface GroupPageProps {
  params: Promise<{ groupId: string }>;
}

interface GroupData {
  _id?: string;
  id?: string;
  metadata?: {
    name: string;
    description?: string;
    avatarUrl?: string;
  };
  members?: any[];
  conversation?: string;
}

export default function GroupPage({ params }: GroupPageProps) {
  const { groupId } = use(params);
  const { data: session } = useSession();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        const res = await fetch(`/api/groups/${groupId}`);
        if (res.ok) {
          setGroup(await res.json());
        } else {
          setError('Group not found');
        }
      } catch (err) {
        setError('Failed to load group');
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [groupId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-950 text-white">
        <p className="text-red-400 mb-4">{error || 'Group not found'}</p>
        <a href="/channel" className="text-blue-400 hover:underline">
          Go back to channels
        </a>
      </div>
    );
  }

  const groupName = group.metadata?.name || 'Group Chat';
  const conversationId = group.conversation || groupId;

  return <ChatRoom conversationId={conversationId} conversationName={groupName} conversationType="group" />;
}
