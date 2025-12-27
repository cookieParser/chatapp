export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  userId: string;
  role: GroupRole;
  joinedAt: Date;
  addedBy?: string;
  nickname?: string;
  isMuted?: boolean;
}

export interface GroupMetadata {
  name: string;
  description?: string;
  avatarUrl?: string;
  isPublic: boolean;
  maxMembers: number;
  allowMemberInvites: boolean;
}

export interface Group {
  id: string;
  metadata: GroupMetadata;
  members: GroupMember[];
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  avatarUrl?: string;
  isPublic?: boolean;
  memberIds: string[];
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  avatarUrl?: string;
  isPublic?: boolean;
  maxMembers?: number;
  allowMemberInvites?: boolean;
}

export interface AddMemberInput {
  userId: string;
  role?: GroupRole;
}

export interface UpdateMemberInput {
  role?: GroupRole;
  nickname?: string;
  isMuted?: boolean;
}
