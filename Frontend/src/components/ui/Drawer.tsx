import * as React from 'react';
import { Drawer as VaulDrawer } from 'vaul';

interface DrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  direction?: 'top' | 'bottom' | 'left' | 'right';
  dismissible?: boolean;
}

const Drawer = ({ open, onOpenChange, children, direction = 'bottom', dismissible = true }: DrawerProps) => (
  <VaulDrawer.Root open={open} onOpenChange={onOpenChange} direction={direction} dismissible={dismissible}>
    {children}
  </VaulDrawer.Root>
);

const DrawerTrigger = VaulDrawer.Trigger;

const DrawerPortal = VaulDrawer.Portal;

const DrawerClose = VaulDrawer.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay ref={ref} className={`fixed inset-0 z-50 bg-black/50 ${className ?? ''}`} {...props} />
));
DrawerOverlay.displayName = 'DrawerOverlay';

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content>
>(({ className, children, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <VaulDrawer.Content
      ref={ref}
      className={`fixed bottom-0 left-0 right-0 z-50 mt-24 flex max-h-[75vh] flex-col rounded-t-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800 max-w-[428px] mx-auto ${className ?? ''}`}
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
      aria-labelledby={ariaLabelledBy ?? undefined}
      aria-describedby={ariaDescribedBy ?? undefined}
      {...props}
    >
      <VaulDrawer.Title className="sr-only">Drawer</VaulDrawer.Title>
      {children}
    </VaulDrawer.Content>
  </DrawerPortal>
));
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
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
