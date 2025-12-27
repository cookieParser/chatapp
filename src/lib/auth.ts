import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import type { UserRole, UserStatus } from '@/types/user';

// Mock user store - replace with your database
const users: Map<
  string,
  {
    id: string;
    email: string;
    username: string;
    displayName: string;
    password?: string;
    avatarUrl?: string;
    bio?: string;
    role: UserRole;
    status: UserStatus;
    statusMessage?: string;
    createdAt: Date;
    updatedAt: Date;
  }
> = new Map();

// Seed a demo user
users.set('demo@example.com', {
  id: '1',
  email: 'demo@example.com',
  username: 'demo',
  displayName: 'Demo User',
  password: bcrypt.hashSync('password123', 10),
  avatarUrl: undefined,
  bio: 'Hello, I am a demo user!',
  role: 'user',
  status: 'online',
  statusMessage: 'Available',
  createdAt: new Date(),
  updatedAt: new Date(),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const user = users.get(email);

        if (!user || !user.password) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          image: user.avatarUrl,
          username: user.username,
          role: user.role,
          status: user.status,
          statusMessage: user.statusMessage,
          bio: user.bio,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.status = user.status;
        token.statusMessage = user.statusMessage;
        token.bio = user.bio;
      }

      // Handle Google OAuth - create/update user profile
      if (account?.provider === 'google' && user) {
        const existingUser = users.get(user.email!);
        if (!existingUser) {
          const newUser = {
            id: crypto.randomUUID(),
            email: user.email!,
            username: user.email!.split('@')[0],
            displayName: user.name || 'User',
            avatarUrl: user.image || undefined,
            role: 'user' as UserRole,
            status: 'online' as UserStatus,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.set(user.email!, newUser);
          token.id = newUser.id;
          token.username = newUser.username;
          token.role = newUser.role;
          token.status = newUser.status;
        } else {
          token.id = existingUser.id;
          token.username = existingUser.username;
          token.role = existingUser.role;
          token.status = existingUser.status;
          token.statusMessage = existingUser.statusMessage;
          token.bio = existingUser.bio;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.role = token.role as UserRole;
        session.user.status = token.status as UserStatus;
        session.user.statusMessage = token.statusMessage as string | undefined;
        session.user.bio = token.bio as string | undefined;
      }
      return session;
    },
  },
});

// Helper to register new users
export async function registerUser(
  email: string,
  password: string,
  username: string,
  displayName: string
) {
  if (users.has(email)) {
    throw new Error('User already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: crypto.randomUUID(),
    email,
    username,
    displayName,
    password: hashedPassword,
    role: 'user' as UserRole,
    status: 'offline' as UserStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  users.set(email, newUser);
  return { id: newUser.id, email, username, displayName };
}
