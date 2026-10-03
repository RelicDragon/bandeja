import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreVertical } from 'lucide-react';
import { usePopoverDismiss, type PopoverDismissReason } from '@/hooks/usePopoverDismiss';

export interface RosterRowMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

/**
 * The organizer's per-row overflow: edit share, note / undo a no-show. Outside
 * press or Escape closes it and hands focus back to the trigger.
 */
export function RosterRowMenu({ name, items }: { name: string; items: RosterRowMenuItem[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback((reason: PopoverDismissReason) => {
    setOpen(false);
    if (reason === 'escape') triggerRef.current?.focus();
  }, []);
  const popoverRef = usePopoverDismiss<HTMLDivElement>(open, close);

  if (items.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={popoverRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('attendance.roster.moreActions', { name })}
        className={`flex h-11 w-8 items-center justify-center rounded-lg transition-colors ${
          open
            ? 'bg-gray-200/70 text-gray-900 dark:bg-gray-700 dark:text-white'
            : 'text-gray-400 hover:bg-gray-200/60 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700/60 dark:hover:text-gray-300'
        }`}
      >
        <MoreVertical size={18} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={t('attendance.roster.moreActions', { name })}
          className="absolute end-0 top-full z-40 mt-1 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-800"
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              autoFocus={index === 0}
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                item.onSelect();
              }}
              className="flex min-h-11 w-full items-center gap-3 px-3 text-start text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              <span className="text-gray-500 dark:text-gray-400" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
