/**
 * Conversations List API Tests
 * Tests the chat list fetching via the API service
 */

import { api } from '@/services/api';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Conversations List API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('GET /api/conversations/list', () => {
    it('should fetch chat list successfully', async () => {
      const mockChatList = [
        {
          id: 'conv1',
          type: 'direct',
          name: 'John Doe',
          image: 'avatar.jpg',
          participants: [
            { id: 'user2', name: 'John Doe', email: 'john@example.com', status: 'online' },
          ],
          lastMessage: {
            content: 'Hello!',
            type: 'text',
            senderName: 'John Doe',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          lastMessageAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockChatList),
      });

      const result = await api.get('/conversations/list');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/conversations/list',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(mockChatList);
      expect(result[0].type).toBe('direct');
      expect(result[0].lastMessage.content).toBe('Hello!');
    });

    it('should return empty array when no conversations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await api.get('/conversations/list');

      expect(result).toEqual([]);
    });

    it('should handle group conversations', async () => {
      const mockChatList = [
        {
          id: 'conv2',
          type: 'group',
          name: 'Team Chat',
          image: 'group.jpg',
          participants: [
            { id: 'user2', name: 'John', email: 'john@example.com', status: 'online' },
            { id: 'user3', name: 'Jane', email: 'jane@example.com', status: 'offline' },
          ],
          lastMessage: null,
          lastMessageAt: null,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockChatList),
      });

      const result = await api.get('/conversations/list');

      expect(result[0].type).toBe('group');
      expect(result[0].name).toBe('Team Chat');
      expect(result[0].participants).toHaveLength(2);
    });

    it('should handle 401 unauthorized error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(api.get('/conversations/list')).rejects.toThrow('API Error: 401');
    });

    it('should handle 500 server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(api.get('/conversations/list')).rejects.toThrow('API Error: 500');
    });
  });
});
