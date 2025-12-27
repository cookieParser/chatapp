/**
 * API security middleware utilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, apiRateLimitKey, RATE_LIMITS } from './rate-limiter';

type RateLimitConfig = { windowMs: number; maxRequests: number };

/**
 * Get client IP from request
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return 'unknown';
}

/**
 * Rate limit response
 */
export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

/**
 * Check API rate limit
 */
export function checkApiRateLimit(
  request: NextRequest,
  route: string,
  config: RateLimitConfig = RATE_LIMITS.API_GENERAL
): { allowed: boolean; response?: NextResponse } {
  const ip = getClientIp(request);
  const result = checkRateLimit(apiRateLimitKey(ip, route), config);
  
  if (!result.success) {
    return {
      allowed: false,
      response: rateLimitResponse(result.retryAfter || 60),
    };
  }
  
  return { allowed: true };
}

/**
 * Security headers for API responses
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

/**
 * Validate content type for POST/PUT requests
 */
export function validateContentType(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const contentType = request.headers.get('content-type');
    return contentType?.includes('application/json') ?? false;
  }
  return true;
}

/**
 * Create a secure API response
 */
export function secureResponse(
  data: unknown,
  status = 200
): NextResponse {
  const response = NextResponse.json(data, { status });
  return addSecurityHeaders(response);
}

/**
 * Create an error response
 */
export function errorResponse(
  message: string,
  status = 400
): NextResponse {
  const response = NextResponse.json({ error: message }, { status });
  return addSecurityHeaders(response);
}
