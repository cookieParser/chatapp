'use client';

/**
 * Stale-While-Revalidate Hook
 * 
 * Shows cached data immediately while fetching fresh data in background.
 * Dramatically reduces perceived latency for returning users.
 * 
 * Flow:
 * 1. Return cached data instantly (if available)
 * 2. Fetch fresh data in background
 * 3. Update UI when fresh data arrives
 * 4. Cache the fresh data for next time
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// In-memory cache (persists across component remounts)
const cache = new Map<string, CacheEntry<unknown>>();

interface UseSWROptions<T> {
  /** Cache key */
  key: string;
  /** Fetch function */
  fetcher: () => Promise<T>;
  /** Time in ms before data is considered stale (default: 30s) */
  staleTime?: number;
  /** Time in ms before cache entry expires (default: 5min) */
  cacheTime?: number;
  /** Revalidate on window focus */
  revalidateOnFocus?: boolean;
  /** Revalidate on reconnect */
  revalidateOnReconnect?: boolean;
  /** Initial data (skip initial fetch if provided) */
  initialData?: T;
  /** Callback when data is updated */
  onSuccess?: (data: T) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

interface UseSWRReturn<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  isStale: boolean;
  mutate: (data?: T | ((current: T | undefined) => T)) => void;
  revalidate: () => Promise<void>;
}

export function useStaleWhileRevalidate<T>({
  key,
  fetcher,
  staleTime = 30000,
  cacheTime = 300000,
  revalidateOnFocus = true,
  revalidateOnReconnect = true,
  initialData,
  onSuccess,
  onError,
}: UseSWROptions<T>): UseSWRReturn<T> {
  // Get cached data
  const getCachedData = useCallback((): T | undefined => {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return initialData;
    
    // Check if cache has expired
    if (Date.now() - entry.timestamp > cacheTime) {
      cache.delete(key);
      return initialData;
    }
    
    return entry.data;
  }, [key, cacheTime, initialData]);

  const isDataStale = useCallback((): boolean => {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return true;
    return Date.now() - entry.timestamp > staleTime;
  }, [key, staleTime]);

  const [data, setData] = useState<T | undefined>(getCachedData);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!getCachedData());
  const [isValidating, setIsValidating] = useState(false);
  
  const isMountedRef = useRef(true);
  const fetchingRef = useRef(false);

  // Fetch and update cache
  const revalidate = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsValidating(true);

    try {
      const freshData = await fetcher();
      
      if (isMountedRef.current) {
        // Update cache
        cache.set(key, { data: freshData, timestamp: Date.now() });
        
        setData(freshData);
        setError(null);
        onSuccess?.(freshData);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const error = err instanceof Error ? err : new Error('Fetch failed');
        setError(error);
        onError?.(error);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsValidating(false);
      }
      fetchingRef.current = false;
    }
  }, [key, fetcher, onSuccess, onError]);

  // Mutate cache directly
  const mutate = useCallback((newData?: T | ((current: T | undefined) => T)) => {
    if (newData === undefined) {
      // Trigger revalidation
      revalidate();
      return;
    }

    const resolvedData = typeof newData === 'function'
      ? (newData as (current: T | undefined) => T)(data)
      : newData;

    cache.set(key, { data: resolvedData, timestamp: Date.now() });
    setData(resolvedData);
  }, [key, data, revalidate]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    
    // If we have cached data but it's stale, revalidate in background
    if (getCachedData() && isDataStale()) {
      revalidate();
    } else if (!getCachedData()) {
      // No cached data, fetch immediately
      revalidate();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [key]); // Only re-run when key changes

  // Revalidate on focus
  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = () => {
      if (isDataStale()) {
        revalidate();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [revalidateOnFocus, isDataStale, revalidate]);

  // Revalidate on reconnect
  useEffect(() => {
    if (!revalidateOnReconnect) return;

    const handleOnline = () => {
      revalidate();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [revalidateOnReconnect, revalidate]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    isStale: isDataStale(),
    mutate,
    revalidate,
  };
}

/**
 * Preload data into cache
 */
export function preloadCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate cache entry
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate cache entries matching pattern
 */
export function invalidateCachePattern(pattern: RegExp): void {
  for (const key of cache.keys()) {
    if (pattern.test(key)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cache
 */
export function clearCache(): void {
  cache.clear();
}
