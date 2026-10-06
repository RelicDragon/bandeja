/**
 * The console's one overlay: a vaul drawer (focus trap, Escape, drag-to-dismiss, animated) that is
 * a bottom sheet on phones — lifted above the software keyboard by the app keyboard contract
 * (`cap-keyboard-aware-sheet` + `OverlayKeyboardBody`) — and a side panel from the end edge on
 * desktop. Android back closes it (`useBackButtonModal`), and while any sheet is open the
 * schedule stops polling (`useConsoleOverlayOpen`).
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useIsLg, useRegisterConsoleOverlay } from './consoleOverlay';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Drawer as VaulDrawer } from 'vaul';
import { Drawer } from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { blurForeignOverlayFocus } from '@/utils/blurForeignOverlayFocus';
import { cx, iconButtonClass } from './classes';

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export interface ConsoleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Plain-text title for assistive tech when `title` is rich. */
  accessibleTitle?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Opened from inside another sheet. */
  nested?: boolean;
  /** Stable id for Android back registration. */
  modalId?: string;
  /** Block dismiss (e.g. while saving). */
  dismissible?: boolean;
}

export function ConsoleSheet({
  open,
  onOpenChange,
  title,
  accessibleTitle,
  description,
  children,
  footer,
  nested,
  modalId,
  dismissible = true,
}: ConsoleSheetProps) {
  const { t } = useTranslation('clubAdmin');
  const isLg = useIsLg();
  const contentRef = useRef<HTMLDivElement | null>(null);
  useBackButtonModal(open, () => {
    if (dismissible) onOpenChange(false);
  }, modalId);
  useRegisterConsoleOverlay(open);
  useLayoutEffect(() => {
    if (open) blurForeignOverlayFocus(contentRef.current);
  }, [open]);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction={isLg ? 'right' : 'bottom'}
      nested={nested}
      dismissible={dismissible}
      handleOnly={!isLg}
    >
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <VaulDrawer.Content
          ref={contentRef}
          aria-describedby={undefined}
          className={cx(
            'fixed z-50 flex min-h-0 flex-col border-border bg-ca-surface text-foreground focus:outline-none',
            isLg
              ? 'inset-y-0 end-0 w-[440px] max-w-[92vw] border-s shadow-2xl'
              : 'cap-keyboard-aware-sheet inset-x-0 bottom-0 mx-auto max-h-[88dvh] w-full max-w-[560px] rounded-t-3xl border-t'
          )}
        >
          <VaulDrawer.Title className="sr-only">{accessibleTitle ?? (typeof title === 'string' ? title : '')}</VaulDrawer.Title>
          <OverlayKeyboardBody>
            <div data-overlay-chrome="" className="bg-ca-surface">
              {!isLg ? (
                <VaulDrawer.Handle className="mt-2.5! mb-1! h-1.5! w-10! bg-border!" aria-label={t('common.dragToClose')} />
              ) : null}
              <div className={cx('flex items-start gap-3 px-4', isLg ? 'pt-4 pb-3' : 'pt-1 pb-3')}>
                <div className="min-w-0 flex-1 pt-1.5">
                  <div className="text-[17px] font-semibold leading-snug text-foreground" aria-hidden={!!accessibleTitle}>
                    {title}
                  </div>
                  {description ? <div className="mt-0.5 text-sm text-muted-foreground">{description}</div> : null}
                </div>
                <VaulDrawer.Close asChild>
                  <button type="button" className={iconButtonClass} aria-label={t('common.close')} disabled={!dismissible}>
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </VaulDrawer.Close>
              </div>
            </div>
            <div className="min-h-0 flex-1 px-4 pb-4">{children}</div>
            {footer ? (
              <div className="sticky bottom-0 z-10 border-t border-border bg-ca-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            ) : (
              <div className="pb-[env(safe-area-inset-bottom)]" />
            )}
          </OverlayKeyboardBody>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </Drawer>
  );
}
