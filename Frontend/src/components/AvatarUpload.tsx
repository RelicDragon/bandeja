import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Upload, User, Camera } from 'lucide-react';
import { AvatarCropModal } from './AvatarCropModal';
import { pickImages } from '@/utils/photoCapture';
import { isCapacitor } from '@/utils/capacitor';

interface AvatarUploadProps {
  currentAvatar?: string;
  onUpload: (avatarFile: File, originalFile: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  disabled?: boolean;
  isGameAvatar?: boolean;
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatar,
  onUpload,
  disabled = false,
  isGameAvatar = false,
}) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file || disabled) return;

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

    setSelectedFile(file);
    setShowCropModal(true);
  }, [disabled, t]);

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
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect, disabled]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
    e.target.value = '';
  }, [handleFileSelect]);

  const handleClick = useCallback(async () => {
    if (disabled || isUploading) return;

    if (isCapacitor()) {
      try {
        const result = await pickImages(1);
        if (result && result.files.length > 0) {
          handleFileSelect(result.files[0]);
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
  }, [disabled, isUploading, handleFileSelect, t]);

  return (
    <>
      <div className="relative">
        <div
          className={`
            relative w-32 h-32 rounded-full overflow-hidden transition-all duration-200
            ${isDragging ? 'ring-4 ring-primary-500 ring-opacity-50 scale-105' : ''}
            ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}
          `}
          style={{ boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.5)' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          {currentAvatar ? (
            <img
              src={currentAvatar || ''}
              alt={t('profile.avatar')}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              {isGameAvatar ? (
                <Camera size={48} className="text-gray-400 dark:text-gray-500" />
              ) : (
                <User size={48} className="text-gray-400 dark:text-gray-500" />
              )}
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-10 rounded-full">
              <div className="animate-spin rounded-full h-10 w-10 border-3 border-white border-t-transparent mb-2"></div>
              <span className="text-white text-sm font-medium">{t('common.uploading')}</span>
            </div>
          )}

          {!isUploading && !disabled && (
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center group">
              <Upload size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
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
        />,
        document.body
      )}
    </>
  );
};
