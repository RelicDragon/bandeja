import { useEffect, useRef } from 'react';
import { backButtonService } from '@/services/backButtonService';

export const useBackButtonModal = (isOpen: boolean, onClose: () => void, modalId?: string) => {
  const idRef = useRef(modalId || `modal-${Date.now()}-${Math.random()}`);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const modalId = idRef.current;
    if (isOpen) {
      backButtonService.registerModal(modalId, () => {
        onCloseRef.current();
      });
    } else {
      backButtonService.unregisterModal(modalId);
    }

    return () => {
      backButtonService.unregisterModal(modalId);
    };
  }, [isOpen]);
};
