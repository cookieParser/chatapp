/**
 * Chat List Cache Module
 * 
 * Provides caching for chat list data including:
 * - Last message
 * - Unread count
 * - Participant info
 * 
 * Supports both in-memory (default) and Redis storage.
 * Cache is automatically invalidated on new messages.
 */

export * from './types';
export * from './storage';
export * from './chatListCache';
