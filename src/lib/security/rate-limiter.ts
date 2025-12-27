/**
 * Rate limiter for socket events and API routes
 * Uses sliding window algorithm for accurate rate limiting
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
  tokens: number[];
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// In-memory store for rate limiting (use Redis in production for distributed systems)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60000; // 1 minute
setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((entry, key) => {
    if (now - entry.windowStart > entry.tokens.length * 2) {
      rateLimitStore.delete(key);
    }
  });
}, CLEANUP_INTERVAL);

export const RATE_LIMITS = {
  // Socket events
  MESSAGE_SEND: { windowMs: 60000, maxRequests: 30 }, // 30 messages per minute
  TYPING: { windowMs: 5000, maxRequests: 10 }, // 10 typing events per 5 seconds
  PRESENCE: { windowMs: 10000, maxRequests: 20 }, // 20 presence updates per 10 seconds
  CONNECTION: { windowMs: 60000, maxRequests: 10 }, // 10 connections per minute per IP
  
  // API routes
  API_GENERAL: { windowMs: 60000, maxRequests: 100 }, // 100 requests per minute
  API_AUTH: { windowMs: 300000, maxRequests: 10 }, // 10 auth attempts per 5 minutes
  API_UPLOAD: { windowMs: 60000, maxRequests: 10 }, // 10 uploads per minute
} as const;

/**
 * Check if a request should be rate limited using sliding window
 */
export function isRateLimited(
  identifier: string,
  config: RateLimitConfig
): { limited: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const key = identifier;
  
  let entry = rateLimitStore.get(key);
  
  if (!entry) {
    entry = { count: 0, windowStart: now, tokens: [] };
    rateLimitStore.set(key, entry);
  }
  
  // Remove tokens outside the window
  entry.tokens = entry.tokens.filter(t => now - t < config.windowMs);
  
  const remaining = Math.max(0, config.maxRequests - entry.tokens.length);
  const oldestToken = entry.tokens[0] || now;
  const resetIn = Math.max(0, config.windowMs - (now - oldestToken));
  
  if (entry.tokens.length >= config.maxRequests) {
    return { limited: true, remaining: 0, resetIn };
  }
  
  // Add new token
  entry.tokens.push(now);
  
  return { limited: false, remaining: remaining - 1, resetIn };
}

/**
 * Create a rate limiter key for socket events
 */
export function socketRateLimitKey(userId: string, event: string): string {
  return `socket:${userId}:${event}`;
}

/**
 * Create a rate limiter key for API routes
 */
export function apiRateLimitKey(ip: string, route: string): string {
  return `api:${ip}:${route}`;
}

/**
 * Rate limiter middleware result
 */
export interface RateLimitResult {
  success: boolean;
  error?: string;
  retryAfter?: number;
}

/**
 * Check rate limit and return result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const result = isRateLimited(identifier, config);
  
  if (result.limited) {
    return {
      success: false,
      error: 'Rate limit exceeded. Please slow down.',
      retryAfter: Math.ceil(result.resetIn / 1000),
    };
  }
  
  return { success: true };
}
