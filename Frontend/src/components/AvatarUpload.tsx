import React, { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Upload, User, Camera } from 'lucide-react';
import { AvatarCropModal } from './AvatarCropModal';
import { pickImages } from '@/utils/photoCapture';
import { isCapacitor } from '@/utils/capacitor';
import { pickVideo } from '@/utils/videoCapture';
import { AvatarVideoEditor } from './AvatarVideoEditor';
import { mediaApi, type MediaUploadResponse } from '@/api/media';
import {
  ANIMATED_AVATAR_MAX_UPLOAD_BYTES,
  fallbackToStillAvatar,
  isAnimatedImageFile,
  isVideoFile,
} from '@/utils/animatedAvatar';

export interface AvatarUploadHandle {
  openPicker: () => void | Promise<void>;
}

interface AvatarUploadProps {
  currentAvatar?: string;
  onUpload: (avatarFile: File, originalFile: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  disabled?: boolean;
  isGameAvatar?: boolean;
  /** Rounded square for team avatars; default is circle */
  variant?: 'circle' | 'squircle';
  /** Replaces default gray placeholder when no image (e.g. composite team avatar) */
  emptyBackground?: React.ReactNode;
  /** Outer box size, e.g. h-[7.5rem] w-[7.5rem] sm:h-32 sm:w-32 */
  sizeClassName?: string;
  /** When false, tap/drag on preview does nothing — call ref.openPicker() from a button */
  surfaceInteractive?: boolean;
  /**
   * User avatars only. `enabled` (Premium): GIF/animated WebP keep their motion and videos open
   * the trim + crop editor. Disabled: animated picks fall back to a still with a one-line hint.
   */
  animated?: {
    enabled: boolean;
    onUploaded: (response: MediaUploadResponse) => void | Promise<void>;
  };
  /** Animated version of `currentAvatar` to show in the preview. */
  currentAvatarAnimated?: string | null;
}

export const AvatarUpload = forwardRef<AvatarUploadHandle, AvatarUploadProps>(function AvatarUpload(
  {
  currentAvatar,
  onUpload,
  disabled = false,
  isGameAvatar = false,
  variant = 'circle',
  emptyBackground,
  sizeClassName,
  surfaceInteractive = true,
  animated,
  currentAvatarAnimated,
},
  ref
) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedIsAnimated, setSelectedIsAnimated] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animatedEnabled = animated?.enabled === true;

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file || disabled) return;

    if (isVideoFile(file)) {
      if (animatedEnabled) setVideoFile(file);
      else toast.error(t('profile.invalidImageType'));
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('profile.invalidImageType'));
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(t('profile.imageTooLarge'));
      return;
    }

    const isAnimated = animated ? await isAnimatedImageFile(file).catch(() => false) : false;
    if (isAnimated && animatedEnabled && file.size > ANIMATED_AVATAR_MAX_UPLOAD_BYTES) {
      toast.error(t('profile.animatedAvatarTooLarge'));
      return;
    }

    setSelectedIsAnimated(isAnimated);
    setSelectedFile(file);
    setShowCropModal(true);
  }, [disabled, t, animated, animatedEnabled]);

  const handleAnimatedCrop = useCallback(async (crop: { x: number; y: number; size: number }) => {
    if (!selectedFile || !animated) return;
    setIsUploading(true);
    try {
      const response = await mediaApi.uploadAnimatedAvatar(selectedFile, crop);
      await animated.onUploaded(response);
      setShowCropModal(false);
      setSelectedFile(null);
    } catch (error) {
      console.error('Animated avatar upload failed:', error);
      toast.error(t('profile.animatedAvatarFailed'));
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, animated, t]);

  const handleVideoSubmit = useCallback(
    async (frames: Blob[], fps: number, onProgress: (fraction: number) => void) => {
      if (!animated) return;
      try {
        const response = await mediaApi.uploadAvatarFrames(frames, fps, onProgress);
        await animated.onUploaded(response);
      } catch (error) {
        toast.error(t('profile.animatedAvatarFailed'));
        throw error;
      }
    },
    [animated, t]
  );

  const handleCropComplete = useCallback(async (avatarFile: File, originalFile: File) => {
    setIsUploading(true);
    try {
      await onUpload(avatarFile, originalFile);
      setShowCropModal(false);
      setSelectedFile(null);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(t('profile.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  }, [onUpload, t]);

  const handleCropCancel = useCallback(() => {
    setShowCropModal(false);
    setSelectedFile(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      void handleFileSelect(files[0]);
    }
  }, [handleFileSelect, disabled]);

  const blockDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void handleFileSelect(files[0]);
    }
    e.target.value = '';
  }, [handleFileSelect]);

  const handleClick = useCallback(async () => {
    if (disabled || isUploading) return;

    if (isCapacitor() && animatedEnabled) {
      // The camera plugin flattens GIFs and cannot return videos; the system picker does both.
      const picked = await pickVideo({ accept: 'image/*,video/*' });
      if (picked) void handleFileSelect(picked.file);
      return;
    }

    if (isCapacitor()) {
      try {
        const result = await pickImages(1);
        if (result && result.files.length > 0) {
          void handleFileSelect(result.files[0]);
        }
      } catch (error: any) {
        console.error('Error picking image:', error);
        if (error.message?.includes('too large')) {
          toast.error(error.message);
        } else {
          toast.error(t('profile.photoPickFailed') || 'Failed to pick photo');
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading, handleFileSelect, animatedEnabled, t]);

  useImperativeHandle(ref, () => ({ openPicker: () => void handleClick() }), [handleClick]);

  const rounded = variant === 'squircle' ? 'rounded-[1.2rem]' : 'rounded-full';
  const uploadOverlayRounded = rounded;
  const size = sizeClassName ?? 'w-32 h-32';

  return (
    <>
      <div
        className={
          sizeClassName ? `relative min-h-0 ${sizeClassName}` : 'relative'
        }
      >
        <div
          className={`
            relative min-h-0 ${size} ${rounded} overflow-hidden transition-all duration-200
            ${isDragging && surfaceInteractive ? 'ring-4 ring-primary-500 ring-opacity-50 scale-105' : ''}
            ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : surfaceInteractive ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}
          `}
          style={{ boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.5)' }}
          onDragOver={surfaceInteractive ? handleDragOver : blockDrag}
          onDragLeave={surfaceInteractive ? handleDragLeave : undefined}
          onDrop={surfaceInteractive ? handleDrop : blockDrag}
          onClick={surfaceInteractive ? () => void handleClick() : undefined}
          role="presentation"
        >
          {currentAvatar ? (
            <img
              key={currentAvatarAnimated || currentAvatar}
              src={currentAvatarAnimated || currentAvatar || ''}
              alt={t('profile.avatar')}
              className="w-full h-full object-cover"
              onError={currentAvatarAnimated ? fallbackToStillAvatar(currentAvatar) : undefined}
            />
          ) : emptyBackground ? (
            <div className="relative h-full w-full">{emptyBackground}</div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-200 dark:bg-gray-700">
              {isGameAvatar ? (
                <Camera size={48} className="text-gray-400 dark:text-gray-500" />
              ) : (
                <User size={48} className="text-gray-400 dark:text-gray-500" />
              )}
            </div>
          )}

          {isUploading && (
            <div
              className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 ${uploadOverlayRounded}`}
            >
              <div className="animate-spin rounded-full h-10 w-10 border-3 border-white border-t-transparent mb-2"></div>
              <span className="text-white text-sm font-medium">{t('common.uploading')}</span>
            </div>
          )}

          {surfaceInteractive && !isUploading && !disabled && (
            <div
              className={`group absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 hover:bg-black/30 ${uploadOverlayRounded}`}
            >
              <Upload size={24} className="text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={
          animatedEnabled
            ? 'image/jpeg,image/jpg,image/png,image/gif,image/webp,video/*'
            : 'image/jpeg,image/jpg,image/png,image/gif,image/webp'
        }
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {showCropModal && selectedFile && createPortal(
        <AvatarCropModal
          imageFile={selectedFile}
          onCrop={handleCropComplete}
          onCancel={handleCropCancel}
          isUploading={isUploading}
          onAnimatedCrop={selectedIsAnimated && animatedEnabled ? (crop) => void handleAnimatedCrop(crop) : undefined}
          hint={selectedIsAnimated && !animatedEnabled ? t('profile.animatedAvatarPremiumHint') : undefined}
        />,
        document.body
      )}

      {videoFile && createPortal(
        <AvatarVideoEditor
          videoFile={videoFile}
          onSubmit={handleVideoSubmit}
          onCancel={() => setVideoFile(null)}
        />,
        document.body
      )}
    </>
  );
});
