export type ChannelType = 'public' | 'private' | 'direct';

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: ChannelType;
  createdBy: string;
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelMember {
  channelId: string;
  userId: string;
  joinedAt: Date;
  lastReadAt?: Date;
}
