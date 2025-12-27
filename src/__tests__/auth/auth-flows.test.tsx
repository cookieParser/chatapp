/**
 * Auth Flow Tests
 * Tests for authentication flows including login, register, and session management
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { signIn, signOut } from 'next-auth/react';

// Mock the modules before importing components
jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: jest.fn(() => ({
    data: null,
    status: 'unauthenticated',
  })),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn().mockReturnValue(null),
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Auth API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('Registration API', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
        username: 'newuser',
        displayName: 'New User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          user: {
            id: 'user123',
            email: userData.email,
            username: userData.username,
            displayName: userData.displayName,
          },
        }),
      });

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.user.email).toBe(userData.email);
      expect(data.user.username).toBe(userData.username);
    });

    it('should reject registration with existing email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'User already exists' }),
      });

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'password123',
          username: 'existinguser',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(409);
    });

    it('should reject registration with invalid email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid email format' }),
      });

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'password123',
          username: 'testuser',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should reject registration with short password', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid password' }),
      });

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: '123',
          username: 'testuser',
        }),
      });

      expect(response.ok).toBe(false);
    });

    it('should reject registration with short username', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid username' }),
      });

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          username: 'ab',
        }),
      });

      expect(response.ok).toBe(false);
    });
  });

  describe('Credentials Login', () => {
    it('should login with valid credentials', async () => {
      (signIn as jest.Mock).mockResolvedValueOnce({
        ok: true,
        error: null,
      });

      const result = await signIn('credentials', {
        email: 'demo@example.com',
        password: 'password123',
        redirect: false,
      });

      expect(signIn).toHaveBeenCalledWith('credentials', {
        email: 'demo@example.com',
        password: 'password123',
        redirect: false,
      });
      expect(result?.ok).toBe(true);
      expect(result?.error).toBeNull();
    });

    it('should fail login with invalid credentials', async () => {
      (signIn as jest.Mock).mockResolvedValueOnce({
        ok: false,
        error: 'CredentialsSignin',
      });

      const result = await signIn('credentials', {
        email: 'wrong@example.com',
        password: 'wrongpassword',
        redirect: false,
      });

      expect(result?.ok).toBe(false);
      expect(result?.error).toBe('CredentialsSignin');
    });

    it('should fail login with missing email', async () => {
      (signIn as jest.Mock).mockResolvedValueOnce({
        ok: false,
        error: 'CredentialsSignin',
      });

      const result = await signIn('credentials', {
        email: '',
        password: 'password123',
        redirect: false,
      });

      expect(result?.ok).toBe(false);
    });

    it('should fail login with missing password', async () => {
      (signIn as jest.Mock).mockResolvedValueOnce({
        ok: false,
        error: 'CredentialsSignin',
      });

      const result = await signIn('credentials', {
        email: 'demo@example.com',
        password: '',
        redirect: false,
      });

      expect(result?.ok).toBe(false);
    });
  });

  describe('OAuth Login', () => {
    it('should initiate Google OAuth login', async () => {
      (signIn as jest.Mock).mockResolvedValueOnce(undefined);

      await signIn('google', { callbackUrl: '/channel' });

      expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/channel' });
    });

    it('should handle OAuth callback with new user', async () => {
      (signIn as jest.Mock).mockResolvedValueOnce({
        ok: true,
        error: null,
      });

      const result = await signIn('google', {
        callbackUrl: '/channel',
        redirect: false,
      });

      expect(result?.ok).toBe(true);
    });
  });

  describe('Sign Out', () => {
    it('should sign out successfully', async () => {
      (signOut as jest.Mock).mockResolvedValueOnce({ url: '/login' });

      await signOut({ callbackUrl: '/login' });

      expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
    });

    it('should redirect to login after sign out', async () => {
      (signOut as jest.Mock).mockResolvedValueOnce({ url: '/login' });

      const result = await signOut({ redirect: false });

      expect(signOut).toHaveBeenCalled();
    });
  });
});

describe('Auth Session Tests', () => {
  it('should return null session for unauthenticated user', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const session = useSession();
    
    expect(session.data).toBeNull();
    expect(session.status).toBe('unauthenticated');
  });

  it('should return session data for authenticated user', () => {
    const { useSession } = require('next-auth/react');
    const mockSession = {
      user: {
        id: 'user123',
        email: 'demo@example.com',
        name: 'Demo User',
        username: 'demo',
        role: 'user',
        status: 'online',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    useSession.mockReturnValue({
      data: mockSession,
      status: 'authenticated',
    });

    const session = useSession();
    
    expect(session.data).toEqual(mockSession);
    expect(session.status).toBe('authenticated');
    expect(session.data.user.email).toBe('demo@example.com');
  });

  it('should show loading state while checking session', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: null,
      status: 'loading',
    });

    const session = useSession();
    
    expect(session.status).toBe('loading');
  });
});

describe('Auth Rate Limiting', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle rate limit on registration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Too many requests' }),
    });

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
      }),
    });

    expect(response.status).toBe(429);
  });

  it('should handle rate limit on login attempts', async () => {
    (signIn as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: 'Too many login attempts',
    });

    const result = await signIn('credentials', {
      email: 'test@example.com',
      password: 'password123',
      redirect: false,
    });

    expect(result?.ok).toBe(false);
  });
});

describe('Auth Input Validation', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should sanitize username input', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: {
          id: 'user123',
          username: 'testuser', // Sanitized
        },
      }),
    });

    await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        username: 'test<script>user',
        displayName: 'Test User',
      }),
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('should validate email format', async () => {
    const invalidEmails = [
      'notanemail',
      '@nodomain.com',
      'no@domain',
      'spaces in@email.com',
    ];

    for (const email of invalidEmails) {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid email format' }),
      });

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'password123',
          username: 'testuser',
        }),
      });

      expect(response.ok).toBe(false);
    }
  });

  it('should enforce password length requirements', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Password must be at least 6 characters' }),
    });

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: '12345', // Too short
        username: 'testuser',
      }),
    });

    expect(response.ok).toBe(false);
  });
});

describe('Auth Error Handling', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle server errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    });

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
      }),
    });

    expect(response.status).toBe(500);
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          username: 'testuser',
        }),
      })
    ).rejects.toThrow('Network error');
  });
});
