import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';

/** Long enough for the sheet's slide-out, so a follow-up dialog does not fight it for focus. */
const SHEET_CLOSE_DELAY_MS = 320;

export interface ActionSheetItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  hint?: string | null;
  disabled?: boolean;
  /** Run after the sheet has slid away — for actions that open another dialog. */
  afterClose?: boolean;
  /** Keep the sheet open (the action swaps the sheet's own content). */
  keepOpen?: boolean;
  onSelect: () => void;
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modalId: string;
  title: string;
  description?: string | null;
  /** Rendered left of the title, e.g. an avatar. */
  leading?: ReactNode;
  items?: ActionSheetItem[];
  children?: ReactNode;
}

export const ActionSheet = ({
  open,
  onOpenChange,
  modalId,
  title,
  description,
  leading,
  items = [],
  children,
}: ActionSheetProps) => {
  useBackButtonModal(open, () => onOpenChange(false), modalId);

  const select = (item: ActionSheetItem) => {
    if (item.disabled) return;
    if (item.keepOpen) {
      item.onSelect();
      return;
    }
    onOpenChange(false);
    if (item.afterClose) {
      window.setTimeout(item.onSelect, SHEET_CLOSE_DELAY_MS);
    } else {
      item.onSelect();
    }
  };

  return (
    // Portal events still bubble through React ancestors (card taps, round header toggles).
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent accessibleTitle={title}>
          <DrawerHandle className="relative mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" />
          <DrawerHeader className="flex items-center gap-3 px-4 pb-2 pt-3 text-start">
            {leading ? <div className="shrink-0">{leading}</div> : null}
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate text-base">{title}</DrawerTitle>
              {description ? (
                <DrawerDescription className="mt-0.5 truncate text-xs">{description}</DrawerDescription>
              ) : null}
            </div>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {items.length > 0 ? (
              <ul className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const danger = item.tone === 'danger';
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={item.disabled}
                        onClick={() => select(item)}
                        className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium transition-colors active:scale-[0.99] disabled:opacity-40 ${
                          danger
                            ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
                            : 'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700/60'
                        }`}
                      >
                        {Icon ? (
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                              danger
                                ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <Icon size={17} aria-hidden />
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{item.label}</span>
                          {item.hint ? (
                            <span className="block truncate text-xs font-normal text-gray-500 dark:text-gray-400">
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    </span>
  );
};
