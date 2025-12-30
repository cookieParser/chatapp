/**
 * Shared Authentication Logic
 * 
 * This module provides authentication utilities that can be used by both
 * the Next.js frontend and the standalone Socket.IO server.
 * 
 * For service separation:
 * - Frontend uses NextAuth for session management
 * - Socket server validates tokens using the same JWT secret
 */

import jwt from 'jsonwebtoken';
import { connectDB, User } from '@/lib/db';

// JWT configuration - must match NextAuth settings
const JWT_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
const JWT_ISSUER = 'chat-app';

export interface TokenPayload {
  userId: string;
  username: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  valid: boolean;
  userId?: string;
  username?: string;
  error?: string;
}

/**
 * Generate a socket authentication token
 * Used by the frontend to create tokens for socket connections
 */
export function generateSocketToken(payload: TokenPayload): string {
  if (!JWT_SECRET) {
    throw new Error('AUTH_SECRET is not configured');
  }
  
  return jwt.sign(
    {
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      type: 'socket',
    },
    JWT_SECRET,
    {
      expiresIn: '7d',
      issuer: JWT_ISSUER,
    }
  );
}

/**
 * Verify a socket authentication token
 * Used by the socket server to validate incoming connections
 */
export function verifySocketToken(token: string): AuthResult {
  if (!JWT_SECRET) {
    return { valid: false, error: 'AUTH_SECRET is not configured' };
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
    }) as TokenPayload & { type?: string };
    
    if (decoded.type !== 'socket') {
      return { valid: false, error: 'Invalid token type' };
    }
    
    return {
      valid: true,
      userId: decoded.userId,
      username: decoded.username,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { valid: false, error: 'Token expired' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Validate user exists in database
 * Optional additional check for socket connections
 */
export async function validateUserExists(userId: string): Promise<boolean> {
  try {
    await connectDB();
    const user = await User.findById(userId).select('_id').lean();
    return !!user;
  } catch (error) {
    console.error('Error validating user:', error);
    return false;
  }
}

/**
 * Get user info from database
 */
export async function getUserInfo(userId: string): Promise<{ name: string; image?: string } | null> {
  try {
    await connectDB();
    const user = await User.findById(userId).select('name image').lean();
    if (!user) return null;
    return { name: user.name, image: user.image };
  } catch (error) {
    console.error('Error getting user info:', error);
    return null;
  }
}

/**
 * Shared configuration for both services
 */
export const authConfig = {
  sessionMaxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  socketTokenMaxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  jwtIssuer: JWT_ISSUER,
};
