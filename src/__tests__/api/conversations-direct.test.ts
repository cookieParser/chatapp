/**
 * Direct Conversation API Tests
 * Tests the direct conversation creation via the API service
 */

import { api } from '@/services/api';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Direct Conversation API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('POST /api/conversations/direct', () => {
    it('should create or get direct conversation successfully', async () => {
      const mockResponse = {
        conversationId: 'conv123',
        isNew: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await api.post('/conversations/direct', { targetUserId: 'user456' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/conversations/direct',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ targetUserId: 'user456' }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should return existing conversation', async () => {
      const mockResponse = {
        conversationId: 'conv123',
        isNew: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await api.post('/conversations/direct', { targetUserId: 'user456' });

      expect(result.isNew).toBe(false);
    });

    it('should handle 401 unauthorized error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(
        api.post('/conversations/direct', { targetUserId: 'user456' })
      ).rejects.toThrow('API Error: 401');
    });

    it('should handle 400 bad request for missing targetUserId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(api.post('/conversations/direct', {})).rejects.toThrow('API Error: 400');
    });

    it('should handle 404 when target user not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(
        api.post('/conversations/direct', { targetUserId: 'nonexistent' })
      ).rejects.toThrow('API Error: 404');
    });
  });
});
