import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { StoryMediaFile } from '../types/storyEditor.types';
import { STORY_MAX_IMAGE_BYTES } from '../types/storyEditor.types';

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_TYPES.includes(file.type);
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

type UseMediaDropZoneOptions = {
  disabled?: boolean;
  onFiles: (files: StoryMediaFile[]) => void;
  maxImageBytes?: number;
};

export function useMediaDropZone({
  disabled = false,
  onFiles,
  maxImageBytes = STORY_MAX_IMAGE_BYTES,
}: UseMediaDropZoneOptions) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);

  const validateAndCollect = useCallback(
    (raw: File[]): StoryMediaFile[] => {
      const result: StoryMediaFile[] = [];
      for (const file of raw) {
        if (isImageFile(file)) {
          if (file.size > maxImageBytes) {
            toast.error(t('stories.imageTooLarge'));
            continue;
          }
          result.push({ file, mediaType: 'IMAGE' });
        } else if (isVideoFile(file)) {
          result.push({ file, mediaType: 'VIDEO' });
        }
      }
      if (raw.length > 0 && result.length === 0) {
        toast.error(t('stories.invalidMediaType'));
      }
      return result;
    },
    [maxImageBytes, t]
  );

  const emitFiles = useCallback(
    (files: StoryMediaFile[]) => {
      if (files.length === 0 || disabled) return;
      onFiles(files);
    },
    [disabled, onFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      emitFiles(validateAndCollect(files));
    },
    [disabled, emitFiles, validateAndCollect]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) pasted.push(file);
        }
      }
      if (pasted.length === 0) return;
      e.preventDefault();
      emitFiles(validateAndCollect(pasted));
    },
    [disabled, emitFiles, validateAndCollect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'IMAGE' | 'VIDEO') => {
      const list = e.target.files;
      if (!list || list.length === 0) return;
      const files = Array.from(list).map((file) => ({ file, mediaType }));
      if (mediaType === 'IMAGE') {
        emitFiles(validateAndCollect(files.map((f) => f.file)).map((f) => f));
      } else {
        emitFiles(files);
      }
      e.target.value = '';
    },
    [emitFiles, validateAndCollect]
  );

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    handleInputChange,
  };
}
