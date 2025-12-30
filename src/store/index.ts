// State management exports
export { usePresenceStore } from './presenceStore';
export type { UserPresence, UserStatus } from './presenceStore';

export { useNotificationStore } from './notificationStore';
export type { UnreadCount } from './notificationStore';

export { useChatStore } from './chatStore';
export type { ChatTab } from './chatStore';

export { useMessageStore, generateTempId } from './messageStore';
export type { OptimisticMessage } from './messageStore';

export { useUserCacheStore } from './userCacheStore';
export type { CachedUser } from './userCacheStore';
