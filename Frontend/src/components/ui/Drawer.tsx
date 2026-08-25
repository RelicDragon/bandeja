import * as React from 'react';
import { X } from 'lucide-react';
import { Drawer as VaulDrawer } from 'vaul';
import { blurForeignOverlayFocus } from '@/utils/blurForeignOverlayFocus';

interface DrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  direction?: 'top' | 'bottom' | 'left' | 'right';
  dismissible?: boolean;
  /** Opt-in. When true, drag-to-dismiss is only from `DrawerHandle`. Default drawers keep content-drag dismiss. */
  handleOnly?: boolean;
  /** Use Vaul NestedRoot when opening inside another drawer (e.g. player card). */
  nested?: boolean;
}

const Drawer = ({
  open,
  onOpenChange,
  children,
  direction = 'bottom',
  dismissible = true,
  handleOnly,
  nested = false,
}: DrawerProps) => {
  /* repositionInputs off: the app lifts surfaces itself via --keyboard-height
     (Capacitor Keyboard resize "none"); Vaul's built-in handling fights it. */
  const Root = nested ? VaulDrawer.NestedRoot : VaulDrawer.Root;
  return (
    <Root
      open={open}
      onOpenChange={onOpenChange}
      direction={direction}
      dismissible={dismissible}
      {...(handleOnly ? { handleOnly: true } : {})}
      repositionInputs={false}
      autoFocus
    >
      {children}
    </Root>
  );
};

const DrawerTrigger = VaulDrawer.Trigger;

const DrawerPortal = VaulDrawer.Portal;

const DrawerClose = VaulDrawer.Close;

const DrawerCloseButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & { 'aria-label'?: string }
>(({ className, children, 'aria-label': ariaLabel, ...props }, ref) => (
  <VaulDrawer.Close asChild>
    <button
      ref={ref}
      type="button"
      className={`p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-600 dark:text-gray-300 ${className ?? ''}`}
      aria-label={ariaLabel ?? 'Close'}
      {...props}
    >
      {children ?? <X size={20} className="text-current" />}
    </button>
  </VaulDrawer.Close>
));
DrawerCloseButton.displayName = 'DrawerCloseButton';

const DrawerHandle = VaulDrawer.Handle;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay ref={ref} className={`fixed inset-0 z-50 bg-black/50 ${className ?? ''}`} {...props} />
));
DrawerOverlay.displayName = 'DrawerOverlay';

type DrawerContentProps =
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content> & {
    accessibleTitle?: React.ReactNode;
  };

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  DrawerContentProps
>(
  (
    {
      className,
      children,
      accessibleTitle,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      ...props
    }: DrawerContentProps,
    ref,
  ) => {
    const contentRef = React.useRef<HTMLElement | null>(null);
    React.useLayoutEffect(() => {
      blurForeignOverlayFocus(contentRef.current);
    }, []);
    return (
  <DrawerPortal>
    <DrawerOverlay />
    <VaulDrawer.Content
      ref={(node) => {
        contentRef.current = node instanceof HTMLElement ? node : null;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={`cap-keyboard-aware-sheet fixed bottom-0 left-0 right-0 z-50 mt-24 flex max-h-[75vh] min-h-0 flex-col rounded-t-3xl border border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-800 dark:text-white max-w-[428px] mx-auto focus:outline-none ${className ?? ''}`}
      aria-labelledby={ariaLabelledBy ?? undefined}
      aria-describedby={ariaDescribedBy ?? undefined}
      {...props}
    >
      <VaulDrawer.Title className="sr-only">
        {accessibleTitle ?? 'Drawer'}
      </VaulDrawer.Title>
      {children}
    </VaulDrawer.Content>
  </DrawerPortal>
    );
  },
);
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`grid gap-1.5 p-4 text-center sm:text-left ${className ?? ''}`} {...props} />
);

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`mt-auto flex flex-col gap-2 p-4 ${className ?? ''}`} {...props} />
);

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Title>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Title>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Title ref={ref} className={`text-lg font-semibold leading-none tracking-tight ${className ?? ''}`} {...props} />
));
DrawerTitle.displayName = 'DrawerTitle';

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Description>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Description>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Description ref={ref} className={`text-sm text-gray-500 dark:text-gray-400 ${className ?? ''}`} {...props} />
));
DrawerDescription.displayName = 'DrawerDescription';

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerCloseButton,
  DrawerHandle,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
