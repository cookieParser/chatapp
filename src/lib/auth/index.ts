/**
 * Auth Module Exports
 * 
 * Re-exports authentication utilities for use throughout the application.
 */

// Main NextAuth exports (frontend only)
export { auth, signIn, signOut, handlers, registerUser } from '@/lib/auth';

// Shared auth utilities (both frontend and socket server)
export {
  generateSocketToken,
  verifySocketToken,
  validateUserExists,
  getUserInfo,
  authConfig,
  type TokenPayload,
  type AuthResult,
} from './shared';
