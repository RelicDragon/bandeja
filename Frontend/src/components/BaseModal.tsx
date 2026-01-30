import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { modalZIndexService } from '@/services/modalZIndexService';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalId?: string;
  isBasic?: boolean;
  forceBackdrop?: boolean;
  children: React.ReactNode;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  contentClassName?: string;
}

export const BaseModal = ({
  isOpen,
  onClose,
  modalId,
  isBasic = false,
  forceBackdrop = false,
  children,
  showCloseButton = true,
  closeOnBackdropClick = true,
  contentClassName,
}: BaseModalProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const modalIdRef = useRef(modalId || `modal-${Date.now()}-${Math.random()}`);
  const [zIndex, setZIndex] = useState(9999);
  const justOpenedRef = useRef(false);

  useBackButtonModal(isOpen, onClose, modalIdRef.current);

  useEffect(() => {
    if (isOpen) {
      const z = modalZIndexService.registerModal(modalIdRef.current);
      setZIndex(z);
      setIsClosing(false);
      setIsAnimating(false);
      setShouldRender(true);
      document.body.style.overflow = 'hidden';
      
      justOpenedRef.current = true;
      const haltEvents = (e: Event) => {
        if (justOpenedRef.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      };
      
      const events = ['touchstart', 'touchend', 'click'];
      events.forEach(eventType => {
        document.addEventListener(eventType, haltEvents, { capture: true, passive: false });
      });
      
      const cleanup = setTimeout(() => {
        justOpenedRef.current = false;
        events.forEach(eventType => {
          document.removeEventListener(eventType, haltEvents, { capture: true });
        });
      }, 100);
      
      if (isBasic) {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
        return () => {
          clearTimeout(cleanup);
          events.forEach(eventType => {
            document.removeEventListener(eventType, haltEvents, { capture: true });
          });
        };
      } else {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
        return () => {
          clearTimeout(cleanup);
          events.forEach(eventType => {
            document.removeEventListener(eventType, haltEvents, { capture: true });
          });
        };
      }
    } else if (shouldRender) {
      if (isBasic) {
        setIsClosing(true);
        const timeout = setTimeout(() => {
          setShouldRender(false);
          setIsClosing(false);
          setIsAnimating(false);
          modalZIndexService.unregisterModal(modalIdRef.current);
          document.body.style.overflow = '';
        }, 300);
        return () => clearTimeout(timeout);
      } else {
        setShouldRender(false);
        setIsClosing(false);
        modalZIndexService.unregisterModal(modalIdRef.current);
        document.body.style.overflow = '';
      }
    }
  }, [isOpen, shouldRender, isBasic]);

  // Separate effect for cleanup on unmount
  useEffect(() => {
    const modalId = modalIdRef.current;
    return () => {
      modalZIndexService.unregisterModal(modalId);
      document.body.style.overflow = '';
    };
  }, []);

  const handleBackdropClick = () => {
    if (closeOnBackdropClick && !justOpenedRef.current) {
      onClose();
    }
  };

  if (!shouldRender) return null;

  const backdropClass = isBasic
    ? isClosing
      ? 'modal-backdrop-exit-active'
      : isAnimating
      ? 'modal-backdrop-enter-active'
      : 'modal-backdrop-enter'
    : '';
  
  const contentClass = isBasic
    ? isClosing
      ? 'modal-content-exit-active'
      : isAnimating
      ? 'modal-content-enter-active'
      : 'modal-content-enter'
    : '';

  const containerClass = isBasic
    ? 'flex items-center justify-center'
    : '';

  return createPortal(
    <div
      className={`fixed inset-0 ${containerClass}`}
      style={{ zIndex }}
      onClick={handleBackdropClick}
    >
      {(isBasic || forceBackdrop) && (
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${backdropClass}`}
          style={{ contain: 'paint', transform: 'translateZ(0)' }}
        />
      )}
      {isBasic ? (
        <div
          className={`relative ${contentClass}`}
          style={{ 
            minWidth: '75%', 
            maxWidth: '95%'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          
          <motion.div
            className={`relative bg-gradient-to-br from-white via-gray-50 to-white dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full border border-gray-200/50 dark:border-gray-700/50 overflow-hidden flex flex-col mx-auto ${contentClassName ?? 'p-3 sm:p-6 md:p-8'}`}
          >
            {showCloseButton && (
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-10 p-2 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            )}
            {children}
          </motion.div>
        </div>
      ) : (
        <>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 p-2 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={20} />
            </button>
          )}
          {children}
        </>
      )}
    </div>,
    document.body
  );
};
