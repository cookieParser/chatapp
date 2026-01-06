/**
 * Performance Utilities Index
 * 
 * Export all performance-related utilities.
 */

export * from './messageSerializer';
export * from './prefetch';

// Re-export commonly used utilities
export { 
  serializeMessage, 
  deserializeMessage,
  compareSerializationSize,
} from './messageSerializer';

export {
  prefetchConversation,
  getPrefetchedData,
  createHoverPrefetcher,
  prefetchAdjacentConversations,
  clearPrefetchCache,
  preloadCriticalResources,
} from './prefetch';

/**
 * Performance monitoring utilities
 */

/**
 * Measure function execution time
 */
export function measureTime<T>(
  fn: () => T,
  label?: string
): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  
  if (label && process.env.NODE_ENV === 'development') {
    console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
  }
  
  return { result, duration };
}

/**
 * Measure async function execution time
 */
export async function measureTimeAsync<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  
  if (label && process.env.NODE_ENV === 'development') {
    console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
  }
  
  return { result, duration };
}

/**
 * Debounce function with leading edge option
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (...args: Parameters<T>) => void {
  const { leading = false, trailing = true } = options;
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  let isLeadingInvoked = false;

  return function (this: any, ...args: Parameters<T>) {
    lastArgs = args;

    if (leading && !isLeadingInvoked) {
      fn.apply(this, args);
      isLeadingInvoked = true;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (trailing && lastArgs) {
        fn.apply(this, lastArgs);
      }
      timeoutId = null;
      isLeadingInvoked = false;
      lastArgs = null;
    }, delay);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

/**
 * Request idle callback polyfill
 */
export function requestIdleCallbackPolyfill(
  callback: IdleRequestCallback,
  options?: IdleRequestOptions
): number {
  if (typeof window === 'undefined') {
    return 0;
  }
  
  if ('requestIdleCallback' in window) {
    return (window as Window).requestIdleCallback(callback, options);
  }
  
  // Fallback for Safari
  const start = Date.now();
  return setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
    });
  }, 1) as unknown as number;
}

/**
 * Cancel idle callback polyfill
 */
export function cancelIdleCallbackPolyfill(id: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  if ('cancelIdleCallback' in window) {
    (window as Window).cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Batch DOM reads/writes to avoid layout thrashing
 */
export const domBatcher = {
  reads: [] as Array<() => void>,
  writes: [] as Array<() => void>,
  scheduled: false,

  read(fn: () => void) {
    this.reads.push(fn);
    this.schedule();
  },

  write(fn: () => void) {
    this.writes.push(fn);
    this.schedule();
  },

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;

    requestAnimationFrame(() => {
      // Execute all reads first
      const reads = this.reads;
      this.reads = [];
      reads.forEach(fn => fn());

      // Then execute all writes
      const writes = this.writes;
      this.writes = [];
      writes.forEach(fn => fn());

      this.scheduled = false;
    });
  },
};
