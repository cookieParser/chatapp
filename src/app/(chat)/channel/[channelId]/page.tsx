'use client';

import { use } from 'react';
import { ChatRoom } from '@/components/chat/ChatRoom';

interface ChannelPageProps {
  params: Promise<{ channelId: string }>;
}

export default function ChannelPage({ params }: ChannelPageProps) {
  const { channelId } = use(params);
  
  return <ChatRoom channelId={channelId} type="channel" />;
}
