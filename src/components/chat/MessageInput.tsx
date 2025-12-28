'use client';

import { useState, useRef, FormEvent, ChangeEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { useFileUpload } from '@/hooks';
import { MediaAttachment } from '@/types';
import { MediaPreview } from './MediaPreview';
import { Paperclip, Image, Loader2, Send } from 'lucide-react';

interface MessageInputProps {
  onSendMessage?: (content: string, media?: MediaAttachment) => void;
}

export function MessageInput({ onSendMessage }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [pendingMedia, setPendingMedia] = useState<MediaAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploadState } = useFileUpload();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !pendingMedia) return;
    
    onSendMessage?.(message.trim(), pendingMedia || undefined);
    setMessage('');
    setPendingMedia(null);
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleRemoveMedia = () => {
    setPendingMedia(null);
  };

  const triggerFileInput = (acceptImages?: boolean) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptImages 
        ? 'image/jpeg,image/png,image/gif,image/webp' 
        : '*';
      fileInputRef.current.click();
    }
  };

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
          disabled={uploadState.isUploading}
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
          disabled={uploadState.isUploading}
          className="flex-shrink-0 p-2 sm:p-2.5 hidden sm:flex"
          title="Upload file"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <Input
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 text-sm sm:text-base"
          disabled={uploadState.isUploading}
        />
        
        <Button 
          type="submit" 
          disabled={(!message.trim() && !pendingMedia) || uploadState.isUploading}
          className="flex-shrink-0 px-3 sm:px-4"
        >
          <Send className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
    </div>
  );
}
