/**
 * Input validation utilities
 */

import { MESSAGE_CONFIG } from '@/lib/constants';

// MongoDB ObjectId pattern (24 hex characters)
const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;

// UUID pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Email pattern (basic)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Username pattern (alphanumeric, underscore, dash, 3-30 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate MongoDB ObjectId
 */
export function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

/**
 * Validate UUID
 */
export function isValidUUID(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Validate ID (ObjectId or UUID)
 */
export function isValidId(id: unknown): id is string {
  return isValidObjectId(id) || isValidUUID(id);
}

/**
 * Validate email
 */
export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && EMAIL_REGEX.test(email) && email.length <= 254;
}

/**
 * Validate username format
 */
export function isValidUsername(username: unknown): username is string {
  return typeof username === 'string' && USERNAME_REGEX.test(username);
}

/**
 * Validate message content
 */
export function validateMessageContent(content: unknown): ValidationResult {
  if (typeof content !== 'string') {
    return { valid: false, error: 'Content must be a string' };
  }
  
  if (content.trim().length === 0) {
    return { valid: false, error: 'Content cannot be empty' };
  }
  
  if (content.length > MESSAGE_CONFIG.MAX_LENGTH) {
    return { valid: false, error: `Content exceeds maximum length of ${MESSAGE_CONFIG.MAX_LENGTH}` };
  }
  
  return { valid: true };
}

/**
 * Validate message type
 */
export function isValidMessageType(type: unknown): type is 'text' | 'image' | 'file' {
  return type === 'text' || type === 'image' || type === 'file';
}

/**
 * Validate conversation ID
 */
export function validateConversationId(id: unknown): ValidationResult {
  if (!isValidObjectId(id)) {
    return { valid: false, error: 'Invalid conversation ID format' };
  }
  return { valid: true };
}

/**
 * Validate user ID
 */
export function validateUserId(id: unknown): ValidationResult {
  if (!isValidId(id)) {
    return { valid: false, error: 'Invalid user ID format' };
  }
  return { valid: true };
}

/**
 * Validate message IDs array
 */
export function validateMessageIds(ids: unknown): ValidationResult {
  if (!Array.isArray(ids)) {
    return { valid: false, error: 'Message IDs must be an array' };
  }
  
  if (ids.length === 0) {
    return { valid: false, error: 'Message IDs array cannot be empty' };
  }
  
  if (ids.length > 100) {
    return { valid: false, error: 'Too many message IDs (max 100)' };
  }
  
  for (const id of ids) {
    if (!isValidObjectId(id)) {
      return { valid: false, error: 'Invalid message ID format' };
    }
  }
  
  return { valid: true };
}

/**
 * Validate user IDs array for presence subscription
 */
export function validateUserIds(ids: unknown): ValidationResult {
  if (!Array.isArray(ids)) {
    return { valid: false, error: 'User IDs must be an array' };
  }
  
  if (ids.length > 100) {
    return { valid: false, error: 'Too many user IDs (max 100)' };
  }
  
  for (const id of ids) {
    if (!isValidId(id)) {
      return { valid: false, error: 'Invalid user ID format' };
    }
  }
  
  return { valid: true };
}

/**
 * Validate send message payload
 */
export interface SendMessagePayload {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
  replyToId?: string;
}

export function validateSendMessagePayload(data: unknown): ValidationResult & { data?: SendMessagePayload } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid payload' };
  }
  
  const payload = data as Record<string, unknown>;
  
  // Validate conversationId
  const convResult = validateConversationId(payload.conversationId);
  if (!convResult.valid) return convResult;
  
  // Validate content
  const contentResult = validateMessageContent(payload.content);
  if (!contentResult.valid) return contentResult;
  
  // Validate type if provided
  if (payload.type !== undefined && !isValidMessageType(payload.type)) {
    return { valid: false, error: 'Invalid message type' };
  }
  
  // Validate replyToId if provided
  if (payload.replyToId !== undefined && !isValidObjectId(payload.replyToId)) {
    return { valid: false, error: 'Invalid reply message ID' };
  }
  
  return {
    valid: true,
    data: {
      conversationId: payload.conversationId as string,
      content: payload.content as string,
      type: (payload.type as 'text' | 'image' | 'file') || 'text',
      replyToId: payload.replyToId as string | undefined,
    },
  };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(limit: unknown, offset: unknown): ValidationResult {
  if (limit !== undefined && limit !== null) {
    const limitNum = Number(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return { valid: false, error: 'Limit must be between 1 and 100' };
    }
  }
  
  if (offset !== undefined && offset !== null) {
    const offsetNum = Number(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return { valid: false, error: 'Offset must be a non-negative number' };
    }
  }
  
  return { valid: true };
}

/**
 * Sanitize and validate string input
 */
export function validateString(
  value: unknown,
  options: { minLength?: number; maxLength?: number; required?: boolean } = {}
): ValidationResult {
  const { minLength = 0, maxLength = 1000, required = true } = options;
  
  if (value === undefined || value === null) {
    return required
      ? { valid: false, error: 'Value is required' }
      : { valid: true };
  }
  
  if (typeof value !== 'string') {
    return { valid: false, error: 'Value must be a string' };
  }
  
  const trimmed = value.trim();
  
  if (required && trimmed.length === 0) {
    return { valid: false, error: 'Value cannot be empty' };
  }
  
  if (trimmed.length < minLength) {
    return { valid: false, error: `Value must be at least ${minLength} characters` };
  }
  
  if (trimmed.length > maxLength) {
    return { valid: false, error: `Value cannot exceed ${maxLength} characters` };
  }
  
  return { valid: true };
}
