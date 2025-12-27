'use client';

import { MediaAttachment } from '@/types';
import { Download, File, X, Image as ImageIcon, Video, Music } from 'lucide-react';
import { Button } from '@/components/ui';

interface MediaPreviewProps {
  media: MediaAttachment;
  onRemove?: () => void;
  showRemove?: boolean;
  compact?: boolean;
}

export function MediaPreview({ media, onRemove, showRemove = false, compact = false }: MediaPreviewProps) {
  const isImage = media.resourceType === 'image';
  const isVideo = media.resourceType === 'video';
  const isAudio = media.mimeType.startsWith('audio/');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(media.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = media.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const getFileIcon = () => {
    if (isImage) return <ImageIcon className="h-5 w-5" />;
    if (isVideo) return <Video className="h-5 w-5" />;
    if (isAudio) return <Music className="h-5 w-5" />;
    return <File className="h-5 w-5" />;
  };

  if (isImage) {
    return (
      <div className={`relative group ${compact ? 'max-w-[200px]' : 'max-w-[300px]'}`}>
        <img
          src={media.url}
          alt={media.filename}
          className="rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
          style={{ maxHeight: compact ? '150px' : '250px' }}
          onClick={() => window.open(media.url, '_blank')}
        />
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleDownload}
            className="h-7 w-7 p-0 bg-black/50 hover:bg-black/70"
          >
            <Download className="h-4 w-4 text-white" />
          </Button>
          {showRemove && onRemove && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onRemove}
              className="h-7 w-7 p-0 bg-black/50 hover:bg-black/70"
            >
              <X className="h-4 w-4 text-white" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={`relative group ${compact ? 'max-w-[200px]' : 'max-w-[300px]'}`}>
        <video
          src={media.url}
          controls
          className="rounded-lg"
          style={{ maxHeight: compact ? '150px' : '250px' }}
        />
        {showRemove && onRemove && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onRemove}
            className="absolute top-2 right-2 h-7 w-7 p-0 bg-black/50 hover:bg-black/70"
          >
            <X className="h-4 w-4 text-white" />
          </Button>
        )}
      </div>
    );
  }

  // File attachment (non-image/video)
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg max-w-[300px]">
      <div className="flex-shrink-0 p-2 bg-gray-200 rounded">
        {getFileIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{media.filename}</p>
        <p className="text-xs text-gray-500">{formatFileSize(media.size)}</p>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={handleDownload} className="h-8 w-8 p-0">
          <Download className="h-4 w-4" />
        </Button>
        {showRemove && onRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
