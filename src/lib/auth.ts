import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import type { UserRole, UserStatus } from '@/types/user';
import { connectDB, User } from '@/lib/db';

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

        try {
          await connectDB();
          
          // Find user in MongoDB
          const user = await User.findOne({ email }).select('+passwordHash');
          
          if (!user || !user.passwordHash) {
            return null;
          }

          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            return null;
          }

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            image: user.image,
            username: user.email.split('@')[0],
            role: 'user',
            status: user.status || 'online',
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
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

      // Handle Google OAuth - create/update user profile in MongoDB
      if (account?.provider === 'google' && user) {
        try {
          await connectDB();
          
          let dbUser = await User.findOne({ email: user.email });
          
          if (!dbUser) {
            dbUser = await User.create({
              email: user.email!,
              name: user.name || 'User',
              image: user.image || undefined,
              provider: 'google',
              status: 'online',
            });
          } else {
            // Update name and image from Google if they changed
            if (user.name && dbUser.name !== user.name) {
              dbUser.name = user.name;
            }
            if (user.image && dbUser.image !== user.image) {
              dbUser.image = user.image;
            }
            await dbUser.save();
          }
          
          token.id = dbUser._id.toString();
          token.name = dbUser.name; // Ensure name is in token
          token.username = dbUser.email.split('@')[0];
          token.role = 'user';
          token.status = dbUser.status || 'online';
        } catch (error) {
          console.error('Google OAuth DB error:', error);
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

// Helper to register new users - stores in MongoDB
export async function registerUser(
  email: string,
  password: string,
  username: string,
  displayName: string
) {
  await connectDB();
  
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error('User already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  
  const newUser = await User.create({
    email,
    name: displayName,
    passwordHash: hashedPassword,
    provider: 'credentials',
    status: 'offline',
  });

  return { 
    id: newUser._id.toString(), 
    email, 
    username, 
    displayName 
  };
}
