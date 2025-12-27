import { NextRequest } from 'next/server';
import { registerUser } from '@/lib/auth';
import {
  checkApiRateLimit,
  secureResponse,
  errorResponse,
  RATE_LIMITS,
  isValidEmail,
  validateString,
  sanitizeUsername,
} from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    // Strict rate limiting for registration
    const rateLimit = checkApiRateLimit(request, 'register', RATE_LIMITS.API_AUTH);
    if (!rateLimit.allowed) return rateLimit.response!;

    const body = await request.json();
    const { email, password, username, displayName } = body;

    // Validate email
    if (!isValidEmail(email)) {
      return errorResponse('Invalid email format');
    }

    // Validate password
    const passwordValidation = validateString(password, { minLength: 6, maxLength: 128 });
    if (!passwordValidation.valid) {
      return errorResponse(passwordValidation.error || 'Invalid password');
    }

    // Validate username
    const usernameValidation = validateString(username, { minLength: 3, maxLength: 30 });
    if (!usernameValidation.valid) {
      return errorResponse(usernameValidation.error || 'Invalid username');
    }

    // Sanitize inputs
    const sanitizedUsername = sanitizeUsername(username);
    const sanitizedDisplayName = displayName ? sanitizeUsername(displayName) : sanitizedUsername;

    const user = await registerUser(email, password, sanitizedUsername, sanitizedDisplayName);

    return secureResponse({ user }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'User already exists') {
      return errorResponse('User already exists', 409);
    }
    return errorResponse('Internal server error', 500);
  }
}
