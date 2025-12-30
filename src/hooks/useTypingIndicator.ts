'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SOCKET_THROTTLE } from '@/lib/constants';

interface TypingUser {
  userId: string;
  username: string;
}

interface UseTypingIndicatorOptions {
  conversationId: string;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

export function useTypingIndicator(options: UseTypingIndicatorOptions) {
  const { conversationId, startTyping, stopTyping } = options;
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastEmitRef = useRef<number>(0);
  const isTypingRef = useRef<boolean>(false);

  // Handle input change with throttled typing indicator (emit at most once every 500ms)
  const handleInputChange = useCallback(() => {
    const now = Date.now();
    
    // Clear existing stop-typing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Throttle: only emit typing:start if 500ms has passed since last emit
    if (now - lastEmitRef.current >= SOCKET_THROTTLE.TYPING_THROTTLE_MS) {
      startTyping(conversationId);
      lastEmitRef.current = now;
      isTypingRef.current = true;
    }

    // Set debounce to stop typing after inactivity
    debounceRef.current = setTimeout(() => {
      stopTyping(conversationId);
      isTypingRef.current = false;
    }, SOCKET_THROTTLE.TYPING_DEBOUNCE_MS);
  }, [conversationId, startTyping, stopTyping]);

  // Handle when user stops typing (blur, submit, etc.)
  const handleStopTyping = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (isTypingRef.current) {
      stopTyping(conversationId);
      isTypingRef.current = false;
    }
    lastEmitRef.current = 0; // Reset throttle on explicit stop
  }, [conversationId, stopTyping]);

  // Add a typing user
  const addTypingUser = useCallback((user: TypingUser) => {
    setTypingUsers(prev => {
      if (prev.some(u => u.userId === user.userId)) return prev;
      return [...prev, user];
    });
  }, []);

  // Remove a typing user
  const removeTypingUser = useCallback((userId: string) => {
    setTypingUsers(prev => prev.filter(u => u.userId !== userId));
  }, []);

  // Update all typing users (from typing:update event)
  const updateTypingUsers = useCallback((users: TypingUser[]) => {
    setTypingUsers(users);
  }, []);

  // Clear all typing users
  const clearTypingUsers = useCallback(() => {
    setTypingUsers([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Format typing indicator text
  const typingText = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
    ? `${typingUsers[0].username} is typing...`
    : typingUsers.length === 2
    ? `${typingUsers[0].username} and ${typingUsers[1].username} are typing...`
    : `${typingUsers[0].username} and ${typingUsers.length - 1} others are typing...`;

  return {
    typingUsers,
    typingText,
    isAnyoneTyping: typingUsers.length > 0,
    handleInputChange,
    handleStopTyping,
    addTypingUser,
    removeTypingUser,
    updateTypingUsers,
    clearTypingUsers,
  };
}
