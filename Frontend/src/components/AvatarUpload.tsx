import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Upload, User, X } from 'lucide-react';
import { AvatarCropModal } from './AvatarCropModal';
import { CachedImage } from './CachedImage';
import { UrlConstructor } from '@/utils/urlConstructor';

interface AvatarUploadProps {
  currentAvatar?: string;
  onUpload: (avatarFile: File, originalFile: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  disabled?: boolean;
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatar,
  onUpload,
  onRemove,
  disabled = false,
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

  const handleRemoveAvatar = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRemove || disabled || isUploading) return;
    
    setIsUploading(true);
    try {
      await onRemove();
    } catch (error) {
      console.error('Remove failed:', error);
      toast.error(t('profile.removeFailed'));
    } finally {
      setIsUploading(false);
    }
  }, [onRemove, disabled, isUploading, t]);

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  return (
    <>
      <div className="relative">
        <div
          className={`
            relative w-32 h-32 rounded-full overflow-hidden transition-all duration-200
            ${isDragging ? 'ring-4 ring-primary-500 ring-opacity-50 scale-105' : ''}
            ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          {currentAvatar ? (
            <CachedImage
              src={UrlConstructor.constructImageUrl(currentAvatar)}
              alt={t('profile.avatar')}
              className="w-full h-full object-cover"
              showLoadingSpinner={true}
              loadingClassName="rounded-full"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <User size={48} className="text-gray-400 dark:text-gray-500" />
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          )}

          {!isUploading && !disabled && (
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center group">
              <Upload size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            </div>
          )}
        </div>

        {currentAvatar && onRemove && !disabled && !isUploading && (
          <button
            onClick={handleRemoveAvatar}
            className="absolute -top-1 -right-9 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors duration-200 shadow-lg hover:shadow-xl z-10"
            title={t('profile.removeAvatar')}
          >
            <X size={14} />
          </button>
        )}
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
        />,
        document.body
      )}
    </>
  );
};
