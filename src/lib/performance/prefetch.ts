/**
 * Prefetching & Predictive Loading
 * 
 * Reduces perceived latency by loading data before user needs it.
 * 
 * Strategies:
 * - Hover prefetch: Load conversation on hover
 * - Adjacent prefetch: Load nearby conversations
 * - Intersection observer: Load when scrolling near
 */

// Prefetch cache with TTL
const prefetchCache = new Map<string, { data: unknown; timestamp: number }>();
const PREFETCH_TTL = 60000; // 1 minute
const pendingPrefetches = new Set<string>();

/**
 * Prefetch conversation messages
 */
export async function prefetchConversation(conversationId: string): Promise<void> {
  // Skip if already cached or pending
  if (pendingPrefetches.has(conversationId)) return;
  
  const cached = prefetchCache.get(`conv:${conversationId}`);
  if (cached && Date.now() - cached.timestamp < PREFETCH_TTL) return;

  pendingPrefetches.add(conversationId);

  try {
    // Use low priority fetch
    const response = await fetch(
      `/api/conversations/${conversationId}/messages?limit=25`,
      {
        priority: 'low' as RequestPriority,
        // @ts-ignore - Next.js specific
        next: { revalidate: 60 },
      }
    );

    if (response.ok) {
      const data = await response.json();
      prefetchCache.set(`conv:${conversationId}`, {
        data,
        timestamp: Date.now(),
      });
    }
  } catch {
    // Silently fail prefetch
  } finally {
    pendingPrefetches.delete(conversationId);
  }
}

/**
 * Get prefetched data if available
 */
export function getPrefetchedData<T>(key: string): T | null {
  const cached = prefetchCache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > PREFETCH_TTL) {
    prefetchCache.delete(key);
    return null;
  }
  
  return cached.data as T;
}

/**
 * Prefetch on hover with debounce
 */
export function createHoverPrefetcher(delay = 150) {
  let timeoutId: NodeJS.Timeout | null = null;

  return {
    onMouseEnter: (conversationId: string) => {
      timeoutId = setTimeout(() => {
        prefetchConversation(conversationId);
      }, delay);
    },
    
    onMouseLeave: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

/**
 * Prefetch adjacent conversations in list
 */
export function prefetchAdjacentConversations(
  conversations: Array<{ id: string }>,
  currentIndex: number,
  range = 2
): void {
  const start = Math.max(0, currentIndex - range);
  const end = Math.min(conversations.length - 1, currentIndex + range);

  for (let i = start; i <= end; i++) {
    if (i !== currentIndex) {
      // Use requestIdleCallback for non-blocking prefetch
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          prefetchConversation(conversations[i].id);
        });
      } else {
        setTimeout(() => {
          prefetchConversation(conversations[i].id);
        }, 0);
      }
    }
  }
}

/**
 * Clear prefetch cache
 */
export function clearPrefetchCache(): void {
  prefetchCache.clear();
}

/**
 * Preload critical resources
 */
export function preloadCriticalResources(): void {
  // Preload fonts
  const fontLinks = [
    '/fonts/inter-var.woff2',
  ];

  fontLinks.forEach(href => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  });
}
