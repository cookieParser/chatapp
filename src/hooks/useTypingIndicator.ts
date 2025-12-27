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

  // Handle input change with debounced typing indicator
  const handleInputChange = useCallback(() => {
    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Emit typing start
    startTyping(conversationId);

    // Set debounce to stop typing after inactivity
    debounceRef.current = setTimeout(() => {
      stopTyping(conversationId);
    }, SOCKET_THROTTLE.TYPING_DEBOUNCE_MS);
  }, [conversationId, startTyping, stopTyping]);

  // Handle when user stops typing (blur, submit, etc.)
  const handleStopTyping = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    stopTyping(conversationId);
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
