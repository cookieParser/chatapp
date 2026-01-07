'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Check, CheckCheck, Clock, AlertCircle, RotateCcw, Reply, Trash2, Loader2, X, Copy } from 'lucide-react';
import { MessageStatus } from '@/types';
import { OptimisticMessage } from '@/store';

interface VirtualizedMessageListProps {
  messages: OptimisticMessage[];
  currentUserId: string | null;
  conversationType?: 'direct' | 'group' | 'channel';
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  typingUsers?: string[];
  onReply?: (message: OptimisticMessage) => void;
  onDelete?: (messageId: string) => void;
  onRetry?: (tempId: string) => void;
  onDiscard?: (tempId: string) => void;
  onCancel?: (tempId: string) => void;
  onLoadMore?: () => void;
  className?: string;
}

// Estimate message height based on content
function estimateMessageHeight(message: OptimisticMessage): number {
  const baseHeight = 60;
  const charsPerLine = 45;
  const lineHeight = 20;
  const lines = Math.ceil((message.content?.length || 0) / charsPerLine);
  const contentHeight = Math.max(lines * lineHeight, 24);
  const replyHeight = message.replyToMessage ? 48 : 0;
  return baseHeight + contentHeight + replyHeight;
}

export function VirtualizedMessageList({
  messages,
  currentUserId,
  conversationType = 'direct',
  isLoading = false,
  isLoadingMore = false,
  hasMore = false,
  typingUsers = [],
  onReply,
  onDelete,
  onRetry,
  onDiscard,
  onCancel,
  onLoadMore,
  className,
}: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const loadMoreTriggeredRef = useRef(false);

  // Group consecutive messages from same sender
  const groupedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const prevMessage = messages[index - 1];
      const nextMessage = messages[index + 1];
      const isOwn = currentUserId ? message.sender._id === currentUserId : false;
      const showAvatar = !prevMessage || prevMessage.sender._id !== message.sender._id;
      const isLastInGroup = !nextMessage || nextMessage.sender._id !== message.sender._id;
      
      return {
        ...message,
        isOwn,
        showAvatar,
        isLastInGroup,
      };
    });
  }, [messages, currentUserId]);

  const virtualizer = useVirtualizer({
    count: groupedMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      const message = groupedMessages[index];
      return message ? estimateMessageHeight(message) : 60;
    }, [groupedMessages]),
    overscan: 10,
    getItemKey: useCallback((index: number) => {
      const message = groupedMessages[index];
      return message?._id || message?.tempId || `msg-${index}`;
    }, [groupedMessages]),
  });

  // Check if scrolled to bottom
  const checkIfAtBottom = useCallback(() => {
    const parent = parentRef.current;
    if (!parent) return true;
    const threshold = 100;
    return parent.scrollHeight - parent.scrollTop - parent.clientHeight < threshold;
  }, []);

  // Check if scrolled near top for loading more
  const checkIfNearTop = useCallback(() => {
    const parent = parentRef.current;
    if (!parent) return false;
    return parent.scrollTop < 200;
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (parentRef.current) {
      parentRef.current.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // Track scroll position and trigger load more
  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const handleScroll = () => {
      isAtBottomRef.current = checkIfAtBottom();
      
      // Load more when near top
      if (checkIfNearTop() && hasMore && !isLoadingMore && !loadMoreTriggeredRef.current && onLoadMore) {
        loadMoreTriggeredRef.current = true;
        onLoadMore();
      }
    };

    parent.addEventListener('scroll', handleScroll, { passive: true });
    return () => parent.removeEventListener('scroll', handleScroll);
  }, [checkIfAtBottom, checkIfNearTop, hasMore, isLoadingMore, onLoadMore]);

  // Reset load more trigger when loading completes
  useEffect(() => {
    if (!isLoadingMore) {
      loadMoreTriggeredRef.current = false;
    }
  }, [isLoadingMore]);

  // Auto-scroll on new messages if at bottom
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && isAtBottomRef.current) {
      // Use setTimeout instead of requestAnimationFrame to avoid flushSync issues
      setTimeout(() => {
        scrollToBottom('smooth');
      }, 0);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      // Delay initial scroll to avoid flushSync during render
      setTimeout(() => {
        scrollToBottom();
      }, 0);
    }
  }, [isLoading, scrollToBottom, messages.length]);

  // Get virtual items outside of render to avoid flushSync issues
  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state
  if (messages.length === 0) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn('h-full overflow-auto', className)}
      style={{ contain: 'strict' }}
    >
      {/* Load more indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <div
        style={{
          height: totalSize,
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualItem) => {
          const message = groupedMessages[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MessageBubble
                message={message}
                showAvatar={message.showAvatar}
                isLastInGroup={message.isLastInGroup}
                conversationType={conversationType}
                onReply={onReply}
                onDelete={onDelete}
                onRetry={onRetry || onDiscard}
                onCancel={onCancel || onDiscard}
              />
            </div>
          );
        })}
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>•</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>•</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>•</span>
            </div>
            <span>
              {typingUsers.length === 1
                ? `${typingUsers[0]} is typing...`
                : `${typingUsers.length} people are typing...`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  message: OptimisticMessage & { isOwn: boolean; showAvatar: boolean; isLastInGroup: boolean };
  showAvatar: boolean;
  isLastInGroup: boolean;
  conversationType: 'direct' | 'group' | 'channel';
  onReply?: (message: OptimisticMessage) => void;
  onDelete?: (messageId: string) => void;
  onRetry?: (tempId: string) => void;
  onCancel?: (tempId: string) => void;
}

const MessageBubble = ({ 
  message, 
  showAvatar, 
  isLastInGroup, 
  conversationType,
  onReply,
  onDelete,
  onRetry, 
  onCancel 
}: MessageBubbleProps) => {
  const { isOwn, status, isDeleted } = message;
  const [showActions, setShowActions] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipeThreshold = 80; // pixels to trigger reply
  const maxSwipe = 100;

  const handleRetry = useCallback(() => {
    onRetry?.(message.tempId);
  }, [onRetry, message.tempId]);

  const handleCancel = useCallback(() => {
    onCancel?.(message.tempId);
  }, [onCancel, message.tempId]);

  const handleReply = useCallback(() => {
    setShowActions(false);
    onReply?.(message);
  }, [onReply, message]);

  const handleDelete = useCallback(() => {
    setShowActions(false);
    onDelete?.(message._id);
  }, [onDelete, message._id]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setShowActions(false);
  }, [message.content]);

  // Touch handlers for swipe and long press
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isDeleted || status === 'sending' || status === 'failed') return;
    
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    
    // Long press timer
    longPressTimerRef.current = setTimeout(() => {
      if (!isSwiping) {
        setShowActions(true);
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, 500);
  }, [isDeleted, status, isSwiping]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isDeleted || !onReply) return;
    
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
    
    // Cancel long press if moving
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // Only allow horizontal swipe if not scrolling vertically
    if (deltaY > 30) {
      setSwipeOffset(0);
      setIsSwiping(false);
      return;
    }
    
    // Determine swipe direction based on message ownership
    // Own messages: swipe left (negative) to reply
    // Others' messages: swipe right (positive) to reply
    const swipeDirection = isOwn ? -1 : 1;
    const adjustedDelta = deltaX * swipeDirection;
    
    if (adjustedDelta > 10) {
      setIsSwiping(true);
      // Apply resistance after threshold
      const resistance = adjustedDelta > swipeThreshold ? 0.3 : 1;
      const offset = Math.min(adjustedDelta * resistance, maxSwipe);
      setSwipeOffset(offset * swipeDirection);
    } else {
      setSwipeOffset(0);
    }
  }, [isDeleted, isOwn, onReply]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // Check if swipe threshold reached
    if (Math.abs(swipeOffset) >= swipeThreshold && onReply) {
      // Vibrate feedback
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
      onReply(message);
    }
    
    // Animate back
    setSwipeOffset(0);
    setIsSwiping(false);
    touchStartRef.current = null;
  }, [swipeOffset, onReply, message]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Close actions when clicking outside
  useEffect(() => {
    if (!showActions) return;
    
    const handleClickOutside = () => {
      setShowActions(false);
    };
    
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showActions]);

  // Calculate reply icon opacity based on swipe progress
  const replyIconOpacity = Math.min(Math.abs(swipeOffset) / swipeThreshold, 1);
  const showReplyIndicator = Math.abs(swipeOffset) > 20;

  return (
    <div
      className={cn(
        'group flex gap-2 px-4 relative overflow-hidden',
        isOwn ? 'flex-row-reverse' : 'flex-row',
        showAvatar ? 'pt-3' : 'pt-0.5'
      )}
    >
      {/* Swipe reply indicator */}
      {showReplyIndicator && (
        <div 
          className={cn(
            'absolute top-1/2 -translate-y-1/2 flex items-center justify-center transition-opacity',
            isOwn ? 'right-2' : 'left-2'
          )}
          style={{ opacity: replyIconOpacity }}
        >
          <div className={cn(
            'p-2 rounded-full',
            Math.abs(swipeOffset) >= swipeThreshold ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}>
            <Reply className="h-4 w-4" />
          </div>
        </div>
      )}

      {/* Avatar */}
      <div 
        className="w-8 shrink-0"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {showAvatar && !isOwn && (
          <Avatar className="h-8 w-8">
            <AvatarImage src={message.sender.image} alt={message.sender.name || message.sender.username} />
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {(message.sender.name || message.sender.username || '?')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          'flex max-w-[70%] flex-col gap-1',
          isOwn && 'items-end'
        )}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {/* Sender name (for groups) */}
        {showAvatar && !isOwn && conversationType !== 'direct' && (
          <span className="text-xs font-medium text-muted-foreground">
            {message.sender.name || message.sender.username}
          </span>
        )}

        {/* Reply preview */}
        {message.replyToMessage && (
          <div
            className={cn(
              'max-w-full rounded-lg border-l-2 bg-muted/50 px-3 py-1.5 text-xs',
              isOwn ? 'border-l-primary' : 'border-l-muted-foreground'
            )}
          >
            <span className="font-medium text-muted-foreground">
              {message.replyToMessage.sender.username}
            </span>
            <p className="truncate text-muted-foreground">
              {message.replyToMessage.isDeleted
                ? 'This message was deleted'
                : message.replyToMessage.content}
            </p>
          </div>
        )}

        {/* Bubble with actions */}
        <div className="relative flex items-center gap-1">
          {/* Desktop action buttons (left side for own messages) */}
          {isOwn && status !== 'sending' && status !== 'failed' && !isDeleted && (
            <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onReply && (
                <button
                  onClick={handleReply}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Reply"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={handleDelete}
                  className="p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <div
            className={cn(
              'relative rounded-2xl px-4 py-2 select-none touch-pan-y',
              isOwn
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground',
              isDeleted && 'italic opacity-60',
              status === 'failed' && 'bg-destructive/20 text-destructive'
            )}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {isDeleted ? 'This message was deleted' : message.content}
            </p>
          </div>

          {/* Desktop action buttons (right side for other's messages) */}
          {!isOwn && !isDeleted && (
            <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onReply && (
                <button
                  onClick={handleReply}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Reply"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Mobile action menu (shows on long press) */}
          {showActions && (
            <div 
              className={cn(
                'absolute z-50 flex items-center gap-1 p-1 bg-popover border border-border rounded-full shadow-lg',
                isOwn ? 'right-0 -top-10' : 'left-0 -top-10'
              )}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {onReply && (
                <button
                  onClick={handleReply}
                  className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Reply className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={handleCopy}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-4 w-4" />
              </button>
              {isOwn && onDelete && (
                <button
                  onClick={handleDelete}
                  className="p-2 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setShowActions(false)}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Status & timestamp */}
        {isLastInGroup && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
            {isOwn && <MessageStatusIcon status={status} />}
            
            {/* Retry/Cancel for failed messages */}
            {status === 'failed' && (
              <div className="flex items-center gap-2 ml-2">
                {onRetry && (
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                )}
                {onCancel && (
                  <button
                    onClick={handleCancel}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Discard
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageStatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'sending':
      return <Clock className="h-3 w-3 animate-pulse" />;
    case 'sent':
      return <Check className="h-3 w-3" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case 'failed':
      return <AlertCircle className="h-3 w-3 text-destructive" />;
    default:
      return null;
  }
}
