export type UserRole = 'guest' | 'user' | 'moderator' | 'admin';
export type UserStatus = 'online' | 'offline' | 'away' | 'busy';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  role: UserRole;
  status: UserStatus;
  statusMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPresence {
  userId: string;
  status: UserStatus;
  lastSeen: Date;
}
