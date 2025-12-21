import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { Button } from './Button';
import { X, Loader2 } from 'lucide-react';
import { getCircularCroppedImg } from '../utils/cropUtils';

interface AvatarCropModalProps {
  imageFile: File;
  onCrop: (avatarFile: File, originalFile: File) => void;
  onCancel: () => void;
  isUploading?: boolean;
}

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  imageFile,
  onCrop,
  onCancel,
  isUploading = false,
}) => {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const onCropComplete = useCallback((_: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCrop = useCallback(async () => {
    if (!croppedAreaPixels) {
      console.error('No crop area selected');
      return;
    }

    setIsProcessing(true);

    try {
      const circularCroppedImageUrl = await getCircularCroppedImg(
        imageUrl,
        croppedAreaPixels,
        rotation
      );

      const response = await fetch(circularCroppedImageUrl);
      const avatarBlob = await response.blob();

      const originalImg = new Image();
      originalImg.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        originalImg.onload = resolve;
        originalImg.onerror = reject;
        originalImg.src = imageUrl;
      });

      const maxDimension = 1920;
      let originalWidth = originalImg.width;
      let originalHeight = originalImg.height;
      
      if (originalWidth > maxDimension || originalHeight > maxDimension) {
        const aspectRatio = originalWidth / originalHeight;
        if (originalWidth > originalHeight) {
          originalWidth = maxDimension;
          originalHeight = maxDimension / aspectRatio;
        } else {
          originalHeight = maxDimension;
          originalWidth = maxDimension * aspectRatio;
        }
      }
      
      const originalCanvas = document.createElement('canvas');
      originalCanvas.width = originalWidth;
      originalCanvas.height = originalHeight;
      const originalCtx = originalCanvas.getContext('2d');
      
      if (!originalCtx) {
        throw new Error('Original canvas context not available');
      }

      originalCtx.drawImage(originalImg, 0, 0, originalWidth, originalHeight);

      const originalBlob = await new Promise<Blob | null>((resolve) => {
        originalCanvas.toBlob(resolve, 'image/jpeg', 0.9);
      });

      if (originalBlob) {
        const avatarFile = new File([avatarBlob], `avatar_${imageFile.name}`, {
          type: 'image/png',
          lastModified: Date.now(),
        });

        const originalFile = new File([originalBlob], `original_${imageFile.name}`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        onCrop(avatarFile, originalFile);
      }

      URL.revokeObjectURL(circularCroppedImageUrl);
    } catch (error) {
      console.error('Error cropping image:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, rotation, imageUrl, imageFile.name, onCrop]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isProcessing && !isUploading) {
      onCancel();
    }
  }, [isProcessing, isUploading, onCancel]);

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        style={{ height: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-full h-full">
          <button
            onClick={onCancel}
            disabled={isProcessing || isUploading}
            className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t('common.close')}
          >
            <X size={20} className="text-gray-700 dark:text-gray-300" />
          </button>

          <div className="w-full h-full">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={true}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              style={{
                containerStyle: {
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                },
              }}
            />
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-50 p-6 bg-gradient-to-t from-black/80 via-black/60 to-transparent">
            <div className="flex gap-3 justify-center max-w-md mx-auto">
              <Button
                variant="secondary"
                onClick={onCancel}
                className="flex-1 bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 backdrop-blur-sm"
                disabled={isProcessing || isUploading}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCrop}
                className="flex-1"
                disabled={isProcessing || isUploading || !croppedAreaPixels}
              >
                {isProcessing ? t('common.processing') : isUploading ? t('common.uploading') : t('common.upload')}
              </Button>
            </div>
          </div>

          {isUploading && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-[100] backdrop-blur-sm">
              <Loader2 className="animate-spin h-12 w-12 text-white mb-4" />
              <p className="text-white text-lg font-medium">{t('common.uploading') || 'Uploading avatar...'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};