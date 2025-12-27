import { useState, useCallback } from 'react';
import { MediaAttachment } from '@/types';

interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
}

interface UseFileUploadReturn {
  upload: (file: File) => Promise<MediaAttachment | null>;
  uploadState: UploadState;
  reset: () => void;
}

export function useFileUpload(): UseFileUploadReturn {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  });

  const reset = useCallback(() => {
    setUploadState({ isUploading: false, progress: 0, error: null });
  }, []);

  const upload = useCallback(async (file: File): Promise<MediaAttachment | null> => {
    setUploadState({ isUploading: true, progress: 0, error: null });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setUploadState({ isUploading: false, progress: 100, error: null });
      return data.media;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadState({ isUploading: false, progress: 0, error: message });
      return null;
    }
  }, []);

  return { upload, uploadState, reset };
}
