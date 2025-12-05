import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useTranslation } from 'react-i18next';
import { UncachedImage } from './UncachedImage';

interface FullscreenImageViewerProps {
  imageUrl: string;
  onClose: () => void;
}

export const FullscreenImageViewer: React.FC<FullscreenImageViewerProps> = ({
  imageUrl,
  onClose,
}) => {
  const { t } = useTranslation();
  const transformRef = useRef<any>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
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
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  }, [imageUrl]);

  const resetView = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    transformRef.current?.resetTransform();
  }, []);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={handleBackdropClick}
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      <div className="relative w-full h-full flex items-center justify-center">
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
              <UncachedImage
                src={imageUrl}
                alt="Fullscreen view"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </TransformComponent>
        </TransformWrapper>

        <div 
          className="absolute top-4 right-4 z-50 flex gap-3"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)',
            right: 'max(1rem, env(safe-area-inset-right))',
          }}
        >
          <button
            onClick={handleDownload}
            className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all duration-200 shadow-xl backdrop-blur-sm"
            aria-label={t('media.download')}
          >
            <Download size={22} />
          </button>
          <button
            onClick={handleClose}
            className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all duration-200 shadow-xl backdrop-blur-sm"
            aria-label={t('common.close')}
          >
            <X size={22} />
          </button>
        </div>

        <div 
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50"
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
    </div>,
    document.body
  );
};
