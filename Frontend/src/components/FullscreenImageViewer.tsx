import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useTranslation } from 'react-i18next';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isCapacitor, isAndroid } from '@/utils/capacitor';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';

interface FullscreenImageViewerProps {
  imageUrl: string;
  onClose: () => void;
  isOpen?: boolean;
}

export const FullscreenImageViewer: React.FC<FullscreenImageViewerProps> = ({
  imageUrl,
  onClose,
  isOpen = true,
}) => {
  const { t } = useTranslation();
  const transformRef = useRef<any>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, isOpen]);

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloading(true);
    try {
      if (isCapacitor()) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        
        const base64 = await base64Promise;
        const fileName = `image-${Date.now()}.jpg`;
        const filePath = fileName;
        
        await Filesystem.writeFile({
          path: filePath,
          data: base64,
          directory: isAndroid() ? Directory.ExternalStorage : Directory.Data,
        });
        
        const fileUri = await Filesystem.getUri({
          path: filePath,
          directory: isAndroid() ? Directory.ExternalStorage : Directory.Data,
        });
        
        await Share.share({
          url: fileUri.uri,
          dialogTitle: t('media.download'),
        });
      } else {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `image-${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download image:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [imageUrl, t]);

  const resetView = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    transformRef.current?.resetTransform();
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
    setSwipeOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartY.current;
    const deltaX = Math.abs(touch.clientX - touchStartX.current);
    
    const transform = transformRef.current?.instance?.state?.scale;
    const isZoomed = transform && transform > 1;
    
    if (!isZoomed && deltaY > 0 && deltaY > deltaX) {
      e.preventDefault();
      setSwipeOffset(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    
    const touch = e.changedTouches[0];
    const deltaY = touch.clientY - touchStartY.current;
    const deltaX = Math.abs(touch.clientX - (touchStartX.current || 0));
    
    const transform = transformRef.current?.instance?.state?.scale;
    const isZoomed = transform && transform > 1;
    
    if (!isZoomed && deltaY > 100 && deltaY > deltaX) {
      onClose();
    } else {
      setSwipeOffset(0);
    }
    
    touchStartY.current = null;
    touchStartX.current = null;
  }, [onClose]);

  return (
    <FullScreenDialog
      open={isOpen}
      onClose={onClose}
      modalId="fullscreen-image-viewer"
      closeOnInteractOutside={false}
      overlayClassName="fullscreen-backdrop-overlay"
      contentClassName="fullscreen-content-animate"
    >
      <div 
        ref={containerRef}
        className="fixed inset-0 flex items-center justify-center bg-transparent"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
        <div
          className="absolute inset-0 z-0"
          onClick={onClose}
          aria-hidden
        />
        <div 
          className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none"
          style={{
            transform: swipeOffset > 0 ? `translateY(${swipeOffset}px)` : 'none',
            transition: swipeOffset === 0 ? 'transform 0.2s' : 'none',
          }}
        >
          <div className="pointer-events-auto max-w-full max-h-full w-fit h-fit">
            <TransformWrapper
              ref={transformRef}
              initialScale={1}
              minScale={0.1}
              maxScale={5}
              centerOnInit={true}
              wheel={{ step: 0.1 }}
              pinch={{ step: 5 }}
              doubleClick={{ disabled: false, step: 0.7 }}
              panning={{ disabled: false }}
            >
              <TransformComponent>
                <div
                  className="relative max-w-full max-h-full"
                  onClick={(e) => e.stopPropagation()}
                >
                <img
                  src={imageUrl}
                  alt="Fullscreen view"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            </TransformComponent>
          </TransformWrapper>
          </div>

          <div 
            className="absolute top-4 right-4 z-50 flex gap-3 pointer-events-auto"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)',
              right: 'max(1rem, env(safe-area-inset-right))',
            }}
          >
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all duration-200 shadow-xl backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t('media.download')}
            >
              {isDownloading ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <Download size={22} />
              )}
            </button>
            <button
              onClick={onClose}
              className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all duration-200 shadow-xl backdrop-blur-sm"
              aria-label={t('common.close')}
            >
              <X size={22} />
            </button>
          </div>

          <div 
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
            style={{
              bottom: 'max(2rem, env(safe-area-inset-bottom))',
            }}
          >
            <button
              onClick={resetView}
              className="px-6 py-3 rounded-xl bg-black/60 hover:bg-black/80 text-white transition-all duration-200 text-sm font-medium shadow-xl backdrop-blur-sm"
            >
              {t('media.resetView')}
            </button>
          </div>
        </div>
      </div>
    </FullScreenDialog>
  );
};
