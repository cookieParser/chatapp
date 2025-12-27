import type { UserRole, UserStatus } from './user';

declare module 'next-auth' {
  interface User {
    username?: string;
    role?: UserRole;
    status?: UserStatus;
    statusMessage?: string;
    bio?: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      username: string;
      role: UserRole;
      status: UserStatus;
      statusMessage?: string;
      bio?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username: string;
    role: UserRole;
    status: UserStatus;
    statusMessage?: string;
    bio?: string;
  }
}
