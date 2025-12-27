/**
 * Socket event throttling utilities for performance optimization
 */

type ThrottledFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
};

/**
 * Creates a throttled function that only invokes the provided function
 * at most once per specified interval
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): ThrottledFunction<T> {
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime: number | null = null;
  const { leading = true, trailing = true } = options;

  const invokeFunc = () => {
    if (lastArgs) {
      func(...lastArgs);
      lastArgs = null;
    }
  };

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    lastArgs = args;

    if (lastCallTime === null && !leading) {
      lastCallTime = now;
    }

    const remaining = lastCallTime ? wait - (now - lastCallTime) : 0;

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastCallTime = now;
      invokeFunc();
    } else if (!timeout && trailing) {
      timeout = setTimeout(() => {
        lastCallTime = leading ? Date.now() : null;
        timeout = null;
        invokeFunc();
      }, remaining);
    }
  };

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    lastArgs = null;
    lastCallTime = null;
  };

  throttled.flush = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      invokeFunc();
    }
  };

  return throttled as ThrottledFunction<T>;
}

/**
 * Creates a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last call
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; maxWait?: number } = {}
): ThrottledFunction<T> {
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime: number | null = null;
  let lastInvokeTime = 0;
  const { leading = false, maxWait } = options;

  const invokeFunc = () => {
    lastInvokeTime = Date.now();
    if (lastArgs) {
      func(...lastArgs);
      lastArgs = null;
    }
  };

  const shouldInvoke = (time: number) => {
    const timeSinceLastCall = lastCallTime ? time - lastCallTime : 0;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === null ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  };

  const debounced = (...args: Parameters<T>) => {
    const now = Date.now();
    const isInvoking = shouldInvoke(now);

    lastArgs = args;
    lastCallTime = now;

    if (isInvoking) {
      if (!timeout && leading) {
        invokeFunc();
      }
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = null;
      if (!leading || lastArgs) {
        invokeFunc();
      }
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    lastArgs = null;
    lastCallTime = null;
  };

  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      invokeFunc();
    }
  };

  return debounced as ThrottledFunction<T>;
}

/**
 * Event aggregator for batching multiple events into a single emission
 */
export class EventAggregator<T> {
  private queue: T[] = [];
  private timeout: NodeJS.Timeout | null = null;
  private readonly maxSize: number;
  private readonly flushInterval: number;
  private readonly onFlush: (items: T[]) => void;

  constructor(options: {
    maxSize: number;
    flushInterval: number;
    onFlush: (items: T[]) => void;
  }) {
    this.maxSize = options.maxSize;
    this.flushInterval = options.flushInterval;
    this.onFlush = options.onFlush;
  }

  add(item: T): void {
    this.queue.push(item);

    // Flush immediately if max size reached
    if (this.queue.length >= this.maxSize) {
      this.flush();
      return;
    }

    // Schedule flush if not already scheduled
    if (!this.timeout) {
      this.timeout = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  flush(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.queue.length > 0) {
      const items = [...this.queue];
      this.queue = [];
      this.onFlush(items);
    }
  }

  clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.queue = [];
  }

  get size(): number {
    return this.queue.length;
  }
}

/**
 * Rate limiter for socket events using sliding window
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canProceed(): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return true;
    }

    return false;
  }

  reset(): void {
    this.timestamps = [];
  }

  get remaining(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const validTimestamps = this.timestamps.filter((t) => t > windowStart);
    return Math.max(0, this.maxRequests - validTimestamps.length);
  }
}
