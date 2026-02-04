import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';

const FULL_SCREEN_OVERLAY_CLASS =
  'fixed inset-0 z-50 bg-black/80 transition-opacity duration-200 data-[state=open]:opacity-100 data-[state=closed]:opacity-0';

const FULL_SCREEN_CONTENT_CLASS =
  'fixed inset-0 z-50 flex flex-col focus:outline-none';

interface FullScreenDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  modalId?: string;
  closeOnInteractOutside?: boolean;
  title?: string;
  children: React.ReactNode;
}

export const FullScreenDialog = ({
  open,
  onOpenChange,
  onClose,
  modalId,
  closeOnInteractOutside = true,
  title = 'Dialog',
  children,
}: FullScreenDialogProps) => {
  const fallbackIdRef = useRef(`fullscreen-${Math.random()}`);
  const handleOpenChange = (o: boolean) => {
    if (!o) onClose?.();
    onOpenChange?.(o);
  };
  useBackButtonModal(open, () => (onClose?.(), onOpenChange?.(false)), modalId ?? fallbackIdRef.current);

  const preventOutside = !closeOnInteractOutside
    ? { onInteractOutside: (e: Event) => e.preventDefault(), onPointerDownOutside: (e: Event) => e.preventDefault() }
    : {};

  const handleBackdropClick = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => handleOpenChange(!!o)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={FULL_SCREEN_OVERLAY_CLASS} />
        <DialogPrimitive.Content
          className={FULL_SCREEN_CONTENT_CLASS}
          {...preventOutside}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {closeOnInteractOutside && (
            <div
              className="absolute inset-0 z-0"
              onClick={handleBackdropClick}
              onPointerDown={handleBackdropClick}
              aria-hidden
            />
          )}
          <div className={`relative z-10 flex-1 flex flex-col ${closeOnInteractOutside ? 'pointer-events-none' : ''}`}>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
