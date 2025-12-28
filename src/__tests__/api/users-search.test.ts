/**
 * User Search API Tests
 * Tests the user search functionality via the API service
 */

import { api } from '@/services/api';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('User Search API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('GET /api/users/search', () => {
    it('should search users successfully', async () => {
      const mockUsers = [
        { id: 'user1', name: 'Test User', email: 'test@example.com', image: null, status: 'online' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUsers),
      });

      const result = await api.get('/users/search', { params: { q: 'test' } });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/search?q=test',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(mockUsers);
    });

    it('should handle empty search results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await api.get('/users/search', { params: { q: 'nonexistent' } });

      expect(result).toEqual([]);
    });

    it('should handle 401 unauthorized error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(api.get('/users/search', { params: { q: 'test' } })).rejects.toThrow('API Error: 401');
    });

    it('should handle 400 bad request for short query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(api.get('/users/search', { params: { q: 'a' } })).rejects.toThrow('API Error: 400');
    });
  });
});
