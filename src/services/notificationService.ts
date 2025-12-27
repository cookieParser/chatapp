import { api } from './api';
import type { UnreadCount, MuteSettings } from '@/types/notification';

export interface NotificationPreferencesResponse {
  pushEnabled: boolean;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  mutedConversations: Array<{
    conversationId: string;
    mutedUntil?: string;
  }>;
}

export const notificationService = {
  // Get unread counts for all conversations
  getUnreadCounts: () => api.get<UnreadCount[]>('/notifications/unread'),

  // Mark conversation as read
  markAsRead: (conversationId: string) =>
    api.post<{ success: boolean }>(`/notifications/read/${conversationId}`),

  // Get notification preferences
  getPreferences: () => api.get<NotificationPreferencesResponse>('/notifications/preferences'),

  // Update notification preferences
  updatePreferences: (data: Partial<NotificationPreferencesResponse>) =>
    api.patch<NotificationPreferencesResponse>('/notifications/preferences', data),

  // Mute a conversation
  muteConversation: (conversationId: string, duration?: number) =>
    api.post<MuteSettings>(`/notifications/mute/${conversationId}`, { duration }),

  // Unmute a conversation
  unmuteConversation: (conversationId: string) =>
    api.delete<{ success: boolean }>(`/notifications/mute/${conversationId}`),

  // Register push subscription
  registerPushSubscription: (subscription: PushSubscriptionJSON) =>
    api.post<{ success: boolean }>('/notifications/push/subscribe', subscription),

  // Unregister push subscription
  unregisterPushSubscription: (endpoint: string) =>
    api.post<{ success: boolean }>('/notifications/push/unsubscribe', { endpoint }),
};

export { notificationService as NotificationService };
