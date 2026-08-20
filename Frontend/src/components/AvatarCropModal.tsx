import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Cropper from 'react-easy-crop';
import { Button } from './Button';
import { Loader2 } from 'lucide-react';
import { exportAvatarUploadFiles } from '../utils/avatarCropExport';
import {
  resolveAvatarExportPixelCrop,
  type CropPoint,
  type CropSize,
  type MediaSize,
  type PixelCrop,
} from '../utils/avatarCropArea';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';

interface AvatarCropModalProps {
  imageFile: File;
  onCrop: (avatarFile: File, originalFile: File) => void;
  onCancel: () => void;
  isUploading?: boolean;
}

const AVATAR_CROP_ASPECT = 1;

function createLiveState() {
  return {
    crop: { x: 0, y: 0 } as CropPoint,
    zoom: 1,
    rotation: 0,
    mediaSize: null as MediaSize | null,
    cropSize: null as CropSize | null,
    lastKnownPixels: null as PixelCrop | null,
  };
}

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  imageFile,
  onCrop,
  onCancel,
  isUploading = false,
}) => {
  const { t } = useTranslation();
  const [crop, setCrop] = useState<CropPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [cropSize, setCropSize] = useState<CropSize | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isOpen, setIsOpen] = useState(true);

  const liveRef = useRef(createLiveState());
  const processingRef = useRef(false);

  const handleCropChange = useCallback((next: CropPoint) => {
    liveRef.current.crop = next;
    setCrop(next);
  }, []);

  const handleZoomChange = useCallback((next: number) => {
    liveRef.current.zoom = next;
    setZoom(next);
  }, []);

  const handleRotationChange = useCallback((next: number) => {
    liveRef.current.rotation = next;
    setRotation(next);
  }, []);

  const handleMediaSize = useCallback((next: MediaSize) => {
    liveRef.current.mediaSize = next;
    setMediaSize((prev) => {
      if (
        prev &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.naturalWidth === next.naturalWidth &&
        prev.naturalHeight === next.naturalHeight
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleCropSize = useCallback((next: CropSize) => {
    liveRef.current.cropSize = next;
    setCropSize((prev) => {
      if (prev && prev.width === next.width && prev.height === next.height) {
        return prev;
      }
      return next;
    });
  }, []);

  const exportPixelCrop = resolveAvatarExportPixelCrop(
    {
      crop,
      zoom,
      rotation,
      mediaSize,
      cropSize,
      aspect: AVATAR_CROP_ASPECT,
    },
    croppedAreaPixels
  );

  const handleClose = () => {
    if (processingRef.current || isUploading) return;
    setIsOpen(false);
    setTimeout(() => {
      onCancel();
    }, 300);
  };

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    liveRef.current = createLiveState();
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setMediaSize(null);
    setCropSize(null);
    setCroppedAreaPixels(null);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  const persistPixelCrop = useCallback((_percentages: PixelCrop, pixels: PixelCrop) => {
    liveRef.current.lastKnownPixels = pixels;
    setCroppedAreaPixels(pixels);
  }, []);

  const handleCrop = useCallback(async () => {
    if (processingRef.current || isUploading) return;
    const pixelCrop = resolveAvatarExportPixelCrop(
      {
        ...liveRef.current,
        aspect: AVATAR_CROP_ASPECT,
      },
      liveRef.current.lastKnownPixels
    );
    if (!pixelCrop) {
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    try {
      const { avatarFile, originalFile } = await exportAvatarUploadFiles({
        imageSrc: imageUrl,
        pixelCrop,
        rotation: liveRef.current.rotation,
        sourceName: imageFile.name,
      });
      onCrop(avatarFile, originalFile);
    } catch (error) {
      console.error('Error cropping image:', error);
      toast.error(t('profile.uploadFailed'));
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [imageUrl, imageFile.name, onCrop, isUploading, t]);

  const closeOnBackdrop = !isProcessing && !isUploading;

  return (
    <FullScreenDialog open={isOpen} onClose={handleClose} modalId="avatar-crop-modal" closeOnInteractOutside={closeOnBackdrop}>
      <div className={`fixed inset-0 flex items-center justify-center p-4 ${closeOnBackdrop ? 'pointer-events-none' : ''}`}>
        <div className={`relative w-full max-w-3xl h-[90vh] bg-gray-900 rounded-2xl overflow-hidden shadow-2xl ${closeOnBackdrop ? 'pointer-events-auto' : ''}`}>
          <div className="absolute inset-0">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={AVATAR_CROP_ASPECT}
              cropShape="round"
              showGrid={true}
              onCropChange={handleCropChange}
              onCropComplete={persistPixelCrop}
              onCropAreaChange={persistPixelCrop}
              setMediaSize={handleMediaSize}
              setCropSize={handleCropSize}
              onZoomChange={handleZoomChange}
              onRotationChange={handleRotationChange}
            />
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-50 p-6 bg-gradient-to-t from-black/80 via-black/60 to-transparent">
            <div className="flex gap-3 justify-center max-w-md mx-auto">
              <Button
                variant="secondary"
                onClick={handleClose}
                className="flex-1 bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 backdrop-blur-sm"
                disabled={isProcessing || isUploading}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => void handleCrop()}
                className="flex-1"
                disabled={isProcessing || isUploading || !exportPixelCrop}
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
    </FullScreenDialog>
  );
};
