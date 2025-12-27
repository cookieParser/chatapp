'use client';

import { useRef, useEffect, useCallback, memo } from 'react';
import { Message } from '@/types';
import { MediaPreview } from './MediaPreview';

interface MessageListProps {
  messages?: Message[];
  currentUserId?: string;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

// Memoized message item to prevent unnecessary re-renders
const MessageItem = memo(function MessageItem({
  message,
  isOwn,
}: {
  message: Message;
  isOwn: boolean;
}) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-lg p-3 ${
          isOwn ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {/* Media attachment */}
        {message.media && (
          <div className="mb-2">
            <MediaPreview media={message.media} compact />
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        {/* Timestamp */}
        <p className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
});

// Loading spinner component
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  return (
    <div className="flex justify-center py-2">
      <div
        className={`${sizeClasses} animate-spin rounded-full border-2 border-gray-300 border-t-blue-500`}
      />
    </div>
  );
}

export function MessageList({
  messages = [],
  currentUserId,
  isLoading = false,
  isLoadingMore = false,
  hasMore = false,
  onLoadMore,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isLoadingMoreRef = useRef(false);

  // Update ref when loading state changes
  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // Maintain scroll position when loading older messages
  useEffect(() => {
    if (!isLoadingMore && prevScrollHeightRef.current > 0 && containerRef.current) {
      const newScrollHeight = containerRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
      if (scrollDiff > 0) {
        containerRef.current.scrollTop += scrollDiff;
      }
      prevScrollHeightRef.current = 0;
    }
  }, [messages.length, isLoadingMore]);

  // Intersection Observer for infinite scroll (load older messages)
  useEffect(() => {
    if (!hasMore || !onLoadMore || !topSentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoadingMoreRef.current && hasMore) {
          // Store current scroll height before loading
          if (containerRef.current) {
            prevScrollHeightRef.current = containerRef.current.scrollHeight;
          }
          onLoadMore();
        }
      },
      {
        root: containerRef.current,
        rootMargin: '100px 0px 0px 0px', // Trigger 100px before reaching top
        threshold: 0,
      }
    );

    observer.observe(topSentinelRef.current);

    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  // Auto-scroll to bottom on new messages (only if already at bottom)
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      scrollToBottom('instant');
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center text-gray-500">
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Top sentinel for infinite scroll */}
      <div ref={topSentinelRef} className="h-1" />

      {/* Loading indicator for older messages */}
      {isLoadingMore && <LoadingSpinner size="sm" />}

      {/* Messages */}
      {messages.map((message) => {
        const isOwn = message.senderId === currentUserId;
        return <MessageItem key={message.id} message={message} isOwn={isOwn} />;
      })}

      {/* Bottom anchor for auto-scroll */}
      <div ref={bottomRef} />
    </div>
  );
}
