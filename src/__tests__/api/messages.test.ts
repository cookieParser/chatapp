/**
 * Message API Tests
 * Tests for the message-related API endpoints and services
 */

import { api } from '@/services/api';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Message API Service', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('api.get', () => {
    it('should fetch messages successfully', async () => {
      const mockMessages = {
        messages: [
          {
            _id: 'msg1',
            content: 'Hello',
            sender: { _id: 'user1', username: 'testuser' },
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: { hasMore: false, nextCursor: null, prevCursor: null },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      });

      const result = await api.get('/conversations/conv1/messages');
      
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/conversations/conv1/messages',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result).toEqual(mockMessages);
    });

    it('should handle query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [] }),
      });

      await api.get('/conversations/conv1/messages', {
        params: { limit: '20', cursor: 'abc123' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/conversations/conv1/messages?limit=20&cursor=abc123',
        expect.any(Object)
      );
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(api.get('/conversations/conv1/messages')).rejects.toThrow('API Error: 401');
    });

    it('should throw error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(api.get('/conversations/conv1/messages')).rejects.toThrow('Network error');
    });
  });

  describe('api.post', () => {
    it('should send message successfully', async () => {
      const newMessage = {
        content: 'Test message',
        conversationId: 'conv1',
      };
      const mockResponse = {
        _id: 'msg2',
        content: 'Test message',
        sender: { _id: 'user1', username: 'testuser' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await api.post('/messages', newMessage);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newMessage),
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await api.post('/messages');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({
          body: undefined,
        })
      );
    });
  });

  describe('api.put', () => {
    it('should update message successfully', async () => {
      const updateData = { content: 'Updated message' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...updateData, _id: 'msg1' }),
      });

      const result = await api.put('/messages/msg1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/messages/msg1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
      );
      expect(result).toEqual({ ...updateData, _id: 'msg1' });
    });
  });

  describe('api.patch', () => {
    it('should patch message status successfully', async () => {
      const patchData = { status: 'read' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await api.patch('/messages/msg1/status', patchData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/messages/msg1/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(patchData),
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('api.delete', () => {
    it('should delete message successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await api.delete('/messages/msg1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/messages/msg1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle 404 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(api.delete('/messages/nonexistent')).rejects.toThrow('API Error: 404');
    });
  });
});

describe('Message Pagination', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should fetch messages with cursor pagination', async () => {
    const page1 = {
      messages: [{ _id: 'msg1' }, { _id: 'msg2' }],
      pagination: { hasMore: true, nextCursor: 'msg2', prevCursor: null },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(page1),
    });

    const result = await api.get('/conversations/conv1/messages', {
      params: { limit: '2' },
    });

    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBe('msg2');
  });

  it('should fetch next page using cursor', async () => {
    const page2 = {
      messages: [{ _id: 'msg3' }, { _id: 'msg4' }],
      pagination: { hasMore: false, nextCursor: null, prevCursor: 'msg3' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(page2),
    });

    const result = await api.get('/conversations/conv1/messages', {
      params: { limit: '2', cursor: 'msg2', direction: 'older' },
    });

    expect(result.pagination.hasMore).toBe(false);
    expect(result.messages).toHaveLength(2);
  });
});
