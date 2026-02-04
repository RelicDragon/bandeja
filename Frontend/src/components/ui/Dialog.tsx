import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { X } from 'lucide-react';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';

const DIALOG_OVERLAY_CLASS =
  'dialog-overlay-animate fixed inset-0 z-50 bg-black/80';
const DIALOG_CONTENT_CLASS =
  'dialog-content-animate fixed left-[50%] top-[50%] z-50 w-[90vw] max-w-[420px] max-h-[85vh] translate-x-[-50%] translate-y-[-50%] flex flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl focus:outline-none';

interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  modalId?: string;
  children: React.ReactNode;
}

const Dialog = ({ open, onOpenChange, onClose, modalId, children }: DialogProps) => {
  const fallbackIdRef = useRef(`modal-${Math.random()}`);
  const handleOpenChange = (o: boolean) => {
    if (!o) onClose?.();
    onOpenChange?.(o);
  };
  useBackButtonModal(open, () => (onClose?.(), onOpenChange?.(false)), modalId ?? fallbackIdRef.current);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => handleOpenChange(!!o)}>
      {children}
    </DialogPrimitive.Root>
  );
};

const DialogRoot = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={className ? `${DIALOG_OVERLAY_CLASS} ${className}` : DIALOG_OVERLAY_CLASS}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    children?: React.ReactNode;
    showCloseButton?: boolean;
    closeOnInteractOutside?: boolean;
  }
>(({ className, showCloseButton = true, closeOnInteractOutside = true, children, ...props }, ref) => {
  const preventOutside = !closeOnInteractOutside ? { onInteractOutside: (e: Event) => e.preventDefault(), onPointerDownOutside: (e: Event) => e.preventDefault() } : {};
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={className ? `${DIALOG_CONTENT_CLASS} ${className}` : DIALOG_CONTENT_CLASS}
        aria-describedby={undefined}
        {...preventOutside}
        {...props}
      >
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            tabIndex={-1}
            className="absolute right-4 top-4 z-10 rounded-md text-gray-900 opacity-70 ring-offset-white transition-opacity hover:opacity-100 hover:bg-gray-100 focus:outline-none focus:ring-0 disabled:pointer-events-none dark:text-gray-200 dark:opacity-70 dark:hover:opacity-100 dark:hover:bg-gray-800 [&>svg]:size-5"
          >
            <X />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DIALOG_HEADER_CLASS =
  'flex items-center justify-between gap-4 p-6 pb-4 border-b border-gray-200/80 dark:border-gray-700/80 flex-shrink-0';
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={className ? `${DIALOG_HEADER_CLASS} ${className}` : DIALOG_HEADER_CLASS} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DIALOG_FOOTER_CLASS =
  'flex flex-row justify-end gap-2 p-6 pt-4 border-t border-gray-200/80 dark:border-gray-700/80 flex-shrink-0';
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={className ? `${DIALOG_FOOTER_CLASS} ${className}` : DIALOG_FOOTER_CLASS} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DIALOG_TITLE_CLASS =
  'text-lg font-semibold leading-none tracking-tight text-gray-900 dark:text-white';
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={className ? `${DIALOG_TITLE_CLASS} ${className}` : DIALOG_TITLE_CLASS}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DIALOG_DESCRIPTION_CLASS = 'text-sm text-gray-500 dark:text-gray-400';
const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={className ? `${DIALOG_DESCRIPTION_CLASS} ${className}` : DIALOG_DESCRIPTION_CLASS}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
