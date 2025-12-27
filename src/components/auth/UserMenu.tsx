'use client';

import { useSession, signOut } from 'next-auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';

export function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  const initials = session.user.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || session.user.username?.[0]?.toUpperCase() || '?';

  return (
    <div className="flex items-center gap-3 border-t border-gray-200 p-4 dark:border-gray-700">
      <Avatar className="h-10 w-10">
        <AvatarImage src={session.user.image || undefined} alt={session.user.name || 'User'} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{session.user.name || session.user.username}</p>
        <p className="truncate text-xs text-gray-500">{session.user.status}</p>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
      >
        Sign out
      </button>
    </div>
  );
}
