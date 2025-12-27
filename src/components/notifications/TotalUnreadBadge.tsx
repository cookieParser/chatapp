'use client';

import { useNotificationStore } from '@/store/notificationStore';
import { UnreadBadge } from './UnreadBadge';
import { cn } from '@/lib/utils';

interface TotalUnreadBadgeProps {
  className?: string;
}

export function TotalUnreadBadge({ className }: TotalUnreadBadgeProps) {
  const { totalUnread } = useNotificationStore();

  return <UnreadBadge count={totalUnread} className={className} />;
}
