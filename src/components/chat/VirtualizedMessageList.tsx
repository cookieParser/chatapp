'use client';

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  memo,
  CSSProperties,
  ReactElement,
} from 'react';
import {
  List,
  useDynamicRowHeight,
  useListRef,
} from 'react-window';
import { OptimisticMessage } from '@/store';
import { MediaPreview } from './MediaPreview';
import {
  Reply,
  Trash2,
  X,
  AlertCircle,
  RotateCcw,
  Clock,
} from 'lucide-react';

interface VirtualizedMessageListProps {
  messages: OptimisticMessage[];
  currentUserId: string | null;
  conversationType: 'direct' | 'group' | 'channel';
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  typingUsers?: string[];
  onReply?: (message: OptimisticMessage) => void;
  onDelete?: (messageId: string) => void;
  onRetry?: (tempId: string) => void;
  onDiscard?: (tempId: string) => void;
  onLoadMore?: () => void;
}

interface MessageRowProps {
  messages: OptimisticMessage[];
  currentUserId: string | null;
  conversationType: 'direct' | 'group' | 'channel';
  onReply?: (message: OptimisticMessage) => void;
  onDelete?: (messageId: string) => void;
  onRetry?: (tempId: string) => void;
  onDiscard?: (tempId: string) => void;
}

// Default row height for estimation
const DEFAULT_ROW_HEIGHT = 80;

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Message row component - using forwardRef pattern for react-window compatibility
function MessageRow({
  ariaAttributes,
  index,
  style,
  messages,
  currentUserId,
  conversationType,
  onReply,
  onDelete,
  onRetry,
  onDiscard,
}: {
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
  index: number;
  style: CSSProperties;
} & MessageRowProps): ReactElement {
  const message = messages[index];
  const isOwn = message.sender._id === currentUserId;
  const senderName =
    message.sender.name || message.sender.username || 'Unknown';

  return (
    <div
      style={style}
      {...ariaAttributes}
      data-message-index={index}
      className="message-row"
    >
      <div className="px-2 sm:px-4 py-1 sm:py-2">
        <div
          className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}
        >
          {/* Action buttons for own messages (left side) */}
          {isOwn &&
            !message.isDeleted &&
            message.status !== 'sending' &&
            message.status !== 'failed' && (
              <div className="hidden sm:flex items-center gap-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onReply?.(message)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  title="Reply"
                >
                  <Reply className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete?.(message._id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}

          <div
            className={`max-w-[85%] sm:max-w-[70%] md:max-w-[60%] rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 shadow-sm ${
              message.isDeleted
                ? 'bg-gray-800/50 text-gray-500 italic'
                : message.status === 'failed'
                  ? 'bg-red-900/50 text-white rounded-br-md border border-red-700/50'
                  : message.status === 'sending'
                    ? 'bg-blue-600/70 text-white rounded-br-md'
                    : isOwn
                      ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-md shadow-blue-900/20'
                      : 'bg-gray-800/90 text-white rounded-bl-md'
            }`}
          >
            {/* Reply preview */}
            {message.replyToMessage && (
              <div
                className={`mb-2 pl-2 border-l-2 ${isOwn ? 'border-blue-300' : 'border-gray-600'}`}
              >
                <p
                  className={`text-xs font-medium ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}
                >
                  {message.replyToMessage.sender.username || 'Unknown'}
                </p>
                <p
                  className={`text-xs truncate ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}
                >
                  {message.replyToMessage.isDeleted
                    ? 'This message was deleted'
                    : message.replyToMessage.content}
                </p>
              </div>
            )}

            {/* Media attachment */}
            {(message as OptimisticMessage & { media?: Parameters<typeof MediaPreview>[0]['media'] }).media && (
              <div className="mb-2">
                <MediaPreview
                  media={
                    (message as OptimisticMessage & { media: Parameters<typeof MediaPreview>[0]['media'] })
                      .media
                  }
                  compact
                />
              </div>
            )}

            {!isOwn &&
              conversationType !== 'direct' &&
              !message.isDeleted && (
                <p className="text-xs font-medium text-blue-400 mb-1">
                  {senderName}
                </p>
              )}
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>

            {/* Status and timestamp */}
            <div
              className={`flex items-center gap-1.5 mt-1 ${
                message.isDeleted
                  ? 'text-gray-600'
                  : isOwn
                    ? 'text-blue-200'
                    : 'text-gray-500'
              }`}
            >
              <span className="text-xs">{formatTime(message.createdAt)}</span>
              {isOwn && !message.isDeleted && (
                <>
                  {message.status === 'sending' && (
                    <span title="Sending...">
                      <Clock className="h-3 w-3 animate-pulse" />
                    </span>
                  )}
                  {message.status === 'failed' && (
                    <span title={message.error || 'Failed to send'}>
                      <AlertCircle className="h-3 w-3 text-red-400" />
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Failed message actions */}
            {message.status === 'failed' && (
              <div className="mt-2 pt-2 border-t border-red-700/50 flex items-center gap-2">
                <span className="text-xs text-red-300">
                  {message.error || 'Failed to send'}
                </span>
                <button
                  onClick={() => onRetry?.(message.tempId)}
                  className="flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200 transition-colors"
                  title="Retry"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
                <button
                  onClick={() => onDiscard?.(message.tempId)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                  title="Discard"
                >
                  <X className="h-3 w-3" />
                  Discard
                </button>
              </div>
            )}
          </div>

          {/* Action buttons for other's messages (right side) */}
          {!isOwn && !message.isDeleted && (
            <div className="hidden sm:flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onReply?.(message)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                title="Reply"
              >
                <Reply className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VirtualizedMessageList({
  messages,
  currentUserId,
  conversationType,
  isLoading = false,
  isLoadingMore = false,
  hasMore = false,
  typingUsers = [],
  onReply,
  onDelete,
  onRetry,
  onDiscard,
  onLoadMore,
}: VirtualizedMessageListProps) {
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevFirstMessageIdRef = useRef<string | null>(null);
  const hasScrolledToBottomRef = useRef(false);
  const loadMoreTriggeredRef = useRef(false);
  const initialRenderRef = useRef(true);

  // Use dynamic row height for variable message sizes
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    key: messages.length,
  });

  // Observe row elements for dynamic height measurement
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new MutationObserver(() => {
      const rows = containerRef.current?.querySelectorAll('.message-row');
      if (rows && rows.length > 0) {
        dynamicRowHeight.observeRowElements(rows);
      }
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    const rows = containerRef.current.querySelectorAll('.message-row');
    if (rows.length > 0) {
      dynamicRowHeight.observeRowElements(rows);
    }

    return () => observer.disconnect();
  }, [dynamicRowHeight]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((behavior: 'instant' | 'smooth' = 'instant') => {
    if (!listRef.current || messages.length === 0) return;
    
    // First try: use react-window's scrollToRow
    try {
      listRef.current.scrollToRow({
        index: messages.length - 1,
        align: 'end',
        behavior,
      });
    } catch (e) {
      // Ignore
    }
    
    // Second try: use native scroll on the element
    const element = listRef.current.element;
    if (element) {
      if (behavior === 'smooth') {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      } else {
        element.scrollTop = element.scrollHeight;
      }
    }
  }, [messages.length, listRef]);

  // Handle list resize - scroll to bottom on initial render
  const handleResize = useCallback(() => {
    if (messages.length > 0) {
      // Always scroll to bottom on resize if we haven't scrolled yet
      setTimeout(() => scrollToBottom('instant'), 0);
    }
  }, [messages.length, scrollToBottom]);

  // Handle visible rows change - trigger load more when near top
  const handleRowsRendered = useCallback(({ startIndex }: { startIndex: number; stopIndex: number }) => {
    // Load more when viewing messages near the top (first 3 messages)
    if (startIndex <= 2 && hasMore && !isLoadingMore && onLoadMore && !loadMoreTriggeredRef.current) {
      loadMoreTriggeredRef.current = true;
      onLoadMore();
    }
    
    // Reset trigger when scrolled away from top
    if (startIndex > 5) {
      loadMoreTriggeredRef.current = false;
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Scroll to bottom when new messages arrive at the end
  useEffect(() => {
    const messageCount = messages.length;
    const prevCount = prevMessageCountRef.current;
    const firstMessageId = messages[0]?._id;
    
    // Skip if no messages
    if (messageCount === 0) {
      return;
    }
    
    // Initial load or same count - just scroll to bottom
    if (prevCount === 0 && messageCount > 0) {
      prevMessageCountRef.current = messageCount;
      prevFirstMessageIdRef.current = firstMessageId;
      hasScrolledToBottomRef.current = true;
      
      // Aggressive scroll attempts
      scrollToBottom('instant');
      requestAnimationFrame(() => scrollToBottom('instant'));
      setTimeout(() => scrollToBottom('instant'), 100);
      setTimeout(() => scrollToBottom('instant'), 300);
      setTimeout(() => scrollToBottom('instant'), 500);
      return;
    }
    
    // Same count, no change
    if (messageCount === prevCount) {
      return;
    }
    
    if (messageCount > prevCount && listRef.current) {
      const lastMessage = messages[messageCount - 1];
      const prevLastMessage = prevCount > 0 ? messages[prevCount - 1] : null;
      
      // Check if new message was added at end (not prepended)
      const isNewMessageAtEnd = !prevLastMessage || 
        new Date(lastMessage?.createdAt) > new Date(prevLastMessage?.createdAt);
      
      // Check if older messages were prepended
      const olderMessagesPrepended = prevFirstMessageIdRef.current && 
        firstMessageId !== prevFirstMessageIdRef.current;
      
      if (isNewMessageAtEnd && !olderMessagesPrepended) {
        // New message at end - scroll to bottom
        setTimeout(() => scrollToBottom('smooth'), 50);
      } else if (olderMessagesPrepended) {
        // Older messages prepended - maintain scroll position by scrolling to the old first message
        const oldFirstIndex = messages.findIndex(m => m._id === prevFirstMessageIdRef.current);
        if (oldFirstIndex > 0) {
          setTimeout(() => {
            listRef.current?.scrollToRow({
              index: oldFirstIndex,
              align: 'start',
              behavior: 'instant',
            });
          }, 50);
        }
        // Reset load more trigger after prepending
        loadMoreTriggeredRef.current = false;
      }
    }
    
    prevMessageCountRef.current = messageCount;
    prevFirstMessageIdRef.current = firstMessageId;
  }, [messages, listRef, scrollToBottom]);

  // Reset flags when conversation changes (messages cleared)
  useEffect(() => {
    if (messages.length === 0) {
      hasScrolledToBottomRef.current = false;
      loadMoreTriggeredRef.current = false;
      prevFirstMessageIdRef.current = null;
      prevMessageCountRef.current = 0;
      initialRenderRef.current = true;
    }
  }, [messages.length]);

  // Use layout effect for immediate scroll attempt after DOM updates
  useLayoutEffect(() => {
    if (messages.length > 0 && !hasScrolledToBottomRef.current) {
      hasScrolledToBottomRef.current = true;
      scrollToBottom('instant');
      // Also schedule delayed scrolls
      setTimeout(() => scrollToBottom('instant'), 200);
      setTimeout(() => scrollToBottom('instant'), 500);
    }
  }, [messages.length, scrollToBottom]);

  // Scroll to bottom when loading completes and we have messages
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      // Scroll after loading spinner is removed and list renders
      requestAnimationFrame(() => {
        scrollToBottom('instant');
      });
      setTimeout(() => scrollToBottom('instant'), 100);
      setTimeout(() => scrollToBottom('instant'), 300);
    }
  }, [isLoading, messages.length, scrollToBottom]);

  // Memoize row props to prevent unnecessary re-renders
  const rowProps: MessageRowProps = useMemo(() => ({
    messages,
    currentUserId,
    conversationType,
    onReply,
    onDelete,
    onRetry,
    onDiscard,
  }), [messages, currentUserId, conversationType, onReply, onDelete, onRetry, onDiscard]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="text-gray-400">No messages yet</p>
        <p className="text-sm text-gray-500 mt-1">Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" ref={containerRef}>
      {/* Loading indicator for older messages */}
      {isLoadingMore && (
        <div className="flex justify-center py-2 bg-gray-900/50">
          <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      
      <div className="flex-1 overflow-hidden">
        <List
          listRef={listRef}
          rowComponent={MessageRow}
          rowCount={messages.length}
          rowHeight={dynamicRowHeight}
          rowProps={rowProps}
          overscanCount={5}
          onRowsRendered={handleRowsRendered}
          onResize={handleResize}
          className="scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
          style={{ height: '100%' }}
        />
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-2 text-gray-400 text-sm">
          <div className="flex gap-1">
            <span
              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <span>{typingUsers.join(', ')} typing...</span>
        </div>
      )}
    </div>
  );
}
