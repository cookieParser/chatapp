'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { PAGINATION } from '@/lib/constants';

interface Message {
  _id: string;
  content: string;
  type: string;
  media?: any;
  createdAt: string;
  replyTo?: string;
  sender: {
    _id: string;
    username: string;
    name: string;
    image?: string;
  };
}

interface PaginationInfo {
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  total?: number;
}

interface UseInfiniteMessagesOptions {
  conversationId: string | null;
  pageSize?: number;
  enabled?: boolean;
}

interface UseInfiniteMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
  loadMore: () => Promise<void>;
  loadPrevious: () => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  removeMessage: (messageId: string) => void;
  reset: () => void;
  refresh: () => Promise<void>;
}

export function useInfiniteMessages({
  conversationId,
  pageSize = PAGINATION.DEFAULT_PAGE_SIZE,
  enabled = true,
}: UseInfiniteMessagesOptions): UseInfiniteMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    hasMore: true,
    nextCursor: null,
    prevCursor: null,
  });

  // Track if initial load has happened
  const initialLoadRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch messages from API
  const fetchMessages = useCallback(
    async (cursor?: string, direction: 'older' | 'newer' = 'older') => {
      if (!conversationId) return null;

      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const params = new URLSearchParams({
        limit: String(pageSize),
        direction,
      });

      if (cursor) {
        params.set('cursor', cursor);
      }

      const response = await fetch(
        `/api/conversations/${conversationId}/messages?${params}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }

      return response.json();
    },
    [conversationId, pageSize]
  );

  // Initial load
  const loadInitial = useCallback(async () => {
    if (!conversationId || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchMessages();
      if (data) {
        setMessages(data.messages);
        setPagination(data.pagination);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to load messages');
      }
    } finally {
      setIsLoading(false);
      initialLoadRef.current = true;
    }
  }, [conversationId, enabled, fetchMessages]);

  // Load older messages (scroll up)
  const loadMore = useCallback(async () => {
    if (!pagination.hasMore || isLoadingMore || !pagination.prevCursor) return;

    setIsLoadingMore(true);

    try {
      const data = await fetchMessages(pagination.prevCursor, 'older');
      if (data && data.messages.length > 0) {
        setMessages((prev) => {
          // Deduplicate messages
          const existingIds = new Set(prev.map((m) => m._id));
          const newMessages = data.messages.filter(
            (m: Message) => !existingIds.has(m._id)
          );
          return [...newMessages, ...prev];
        });
        setPagination((prev) => ({
          ...prev,
          hasMore: data.pagination.hasMore,
          prevCursor: data.pagination.prevCursor,
        }));
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to load more messages');
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [pagination, isLoadingMore, fetchMessages]);

  // Load newer messages (for real-time sync)
  const loadPrevious = useCallback(async () => {
    if (!pagination.nextCursor) return;

    try {
      const data = await fetchMessages(pagination.nextCursor, 'newer');
      if (data && data.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m._id));
          const newMessages = data.messages.filter(
            (m: Message) => !existingIds.has(m._id)
          );
          return [...prev, ...newMessages];
        });
        setPagination((prev) => ({
          ...prev,
          nextCursor: data.pagination.nextCursor,
        }));
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load newer messages:', err);
      }
    }
  }, [pagination.nextCursor, fetchMessages]);

  // Add a new message (optimistic update)
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      // Check for duplicates
      if (prev.some((m) => m._id === message._id)) {
        return prev;
      }
      return [...prev, message];
    });
    // Update cursor to include new message
    setPagination((prev) => ({
      ...prev,
      nextCursor: message._id,
    }));
  }, []);

  // Update a message
  const updateMessage = useCallback(
    (messageId: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, ...updates } : m))
      );
    },
    []
  );

  // Remove a message
  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setMessages([]);
    setPagination({
      hasMore: true,
      nextCursor: null,
      prevCursor: null,
    });
    setError(null);
    initialLoadRef.current = false;
  }, []);

  // Refresh messages
  const refresh = useCallback(async () => {
    reset();
    await loadInitial();
  }, [reset, loadInitial]);

  // Load initial messages when conversation changes
  useEffect(() => {
    if (conversationId && enabled) {
      reset();
      loadInitial();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [conversationId, enabled]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    error,
    hasMore: pagination.hasMore,
    hasPrevious: !!pagination.nextCursor,
    loadMore,
    loadPrevious,
    addMessage,
    updateMessage,
    removeMessage,
    reset,
    refresh,
  };
}
