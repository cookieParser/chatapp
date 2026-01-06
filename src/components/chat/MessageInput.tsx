'use client';

import { useState, useRef, FormEvent, ChangeEvent, useCallback, memo } from 'react';
import { Button, Input } from '@/components/ui';
import { useFileUpload } from '@/hooks';
import { MediaAttachment } from '@/types';
import { MediaPreview } from './MediaPreview';
import { Paperclip, Image, Loader2, Send } from 'lucide-react';
import { SendMessagePayload, MessageResponse } from '@/lib/socket/types';

interface MessageInputProps {
  /**
   * Socket.IO-based message sender function.
   * Messages are sent exclusively through Socket.IO, not HTTP.
   */
  sendMessage: (data: SendMessagePayload) => Promise<MessageResponse>;
  conversationId: string;
  isConnected: boolean;
  onTyping?: () => void;
  replyToId?: string;
  onClearReply?: () => void;
}

export const MessageInput = memo(function MessageInput({ 
  sendMessage, 
  conversationId, 
  isConnected,
  onTyping,
  replyToId,
  onClearReply,
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [pendingMedia, setPendingMedia] = useState<MediaAttachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploadState } = useFileUpload();

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !pendingMedia) return;
    if (!isConnected || isSending) return;

    const content = message.trim();
    setIsSending(true);
    setMessage('');
    
    try {
      // Send message via Socket.IO only - no HTTP fallback
      const response = await sendMessage({
        conversationId,
        content,
        type: pendingMedia ? 'image' : 'text',
        replyToId,
      });

      if (response.success) {
        setPendingMedia(null);
        onClearReply?.();
      } else {
        // Restore message on failure for retry
        setMessage(content);
        console.error('Failed to send message:', response.error);
      }
    } catch (error) {
      // Restore message on error for retry
      setMessage(content);
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  }, [message, pendingMedia, isConnected, isSending, sendMessage, conversationId, replyToId, onClearReply]);

  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const media = await upload(file);
    if (media) {
      setPendingMedia(media);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [upload]);

  const handleRemoveMedia = useCallback(() => {
    setPendingMedia(null);
  }, []);

  const triggerFileInput = useCallback((acceptImages?: boolean) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptImages 
        ? 'image/jpeg,image/png,image/gif,image/webp' 
        : '*';
      fileInputRef.current.click();
    }
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    onTyping?.();
  }, [onTyping]);

  const isDisabled = !isConnected || uploadState.isUploading || isSending;

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 p-2 sm:p-4">
      {/* Pending media preview */}
      {pendingMedia && (
        <div className="mb-2 sm:mb-3">
          <MediaPreview media={pendingMedia} onRemove={handleRemoveMedia} showRemove compact />
        </div>
      )}

      {/* Upload progress */}
      {uploadState.isUploading && (
        <div className="mb-2 sm:mb-3 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Uploading...</span>
        </div>
      )}

      {/* Upload error */}
      {uploadState.error && (
        <div className="mb-2 sm:mb-3 text-sm text-red-500">
          {uploadState.error}
        </div>
      )}

      {/* Connection status */}
      {!isConnected && (
        <div className="mb-2 sm:mb-3 text-sm text-yellow-500">
          Connecting to server...
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-1 sm:gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Upload file"
        />
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => triggerFileInput(true)}
          disabled={isDisabled}
          className="flex-shrink-0 p-2 sm:p-2.5"
          title="Upload image"
        >
          <Image className="h-5 w-5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => triggerFileInput(false)}
          disabled={isDisabled}
          className="flex-shrink-0 p-2 sm:p-2.5 hidden sm:flex"
          title="Upload file"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <Input
          value={message}
          onChange={handleInputChange}
          placeholder="Type a message..."
          className="flex-1 text-sm sm:text-base"
          disabled={isDisabled}
        />
        
        <Button 
          type="submit" 
          disabled={(!message.trim() && !pendingMedia) || isDisabled}
          className="flex-shrink-0 px-3 sm:px-4"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Send</span>
            </>
          )}
        </Button>
      </form>
    </div>
  );
});
