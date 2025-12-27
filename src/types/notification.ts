export type NotificationType = 'message' | 'mention' | 'group_invite' | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  conversationId?: string;
  senderId?: string;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationPreferences {
  userId: string;
  pushEnabled: boolean;
  soundEnabled: boolean;
  mutedConversations: string[];
  mutedUntil?: Record<string, Date>; // conversationId -> mute expiry
}

export interface UnreadCount {
  conversationId: string;
  count: number;
}

export interface MuteSettings {
  conversationId: string;
  isMuted: boolean;
  mutedUntil?: Date;
}
