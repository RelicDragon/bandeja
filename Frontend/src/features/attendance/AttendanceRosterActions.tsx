/**
 * PRD 346 — the grey "No-show" tag and the owner/admin overflow action next to
 * a roster row.
 *
 * The tag is deliberately neutral grey, never red: a no-show note is a memory
 * aid and a conversation starter, not a punishment. It can be undone for seven
 * days, and nothing about it touches the player's seat or rating.
 */
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreVertical } from 'lucide-react';
import { usePopoverDismiss, type PopoverDismissReason } from '@/hooks/usePopoverDismiss';
import type { AttendanceDotState } from './attendanceVisuals';

export interface AttendanceRosterActionsProps {
  state: AttendanceDotState | undefined;
  /** Owner/admin, game finished, still inside the 7-day window. */
  canNote: boolean;
  onNote?: () => void;
  onUndo?: () => void;
}

export function AttendanceRosterActions({
  state,
  canNote,
  onNote,
  onUndo,
}: AttendanceRosterActionsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isNoted = state === 'NO_SHOW';

  // Outside press or Escape closes the menu and hands focus back to the "⋮"
  // trigger, so a keyboard user is never dropped into a dead end.
  const close = useCallback((reason: PopoverDismissReason) => {
    setOpen(false);
    if (reason === 'escape') triggerRef.current?.focus();
  }, []);
  const popoverRef = usePopoverDismiss<HTMLDivElement>(open, close);

  if (!isNoted && !canNote) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {isNoted ? (
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          {t('attendance.noShow.tag')}
        </span>
      ) : null}

      {canNote ? (
        <div className="relative" ref={popoverRef}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={isNoted ? t('attendance.noShow.undoAction') : t('attendance.noShow.action')}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-gray-700/70"
          >
            <MoreVertical size={16} aria-hidden />
          </button>
          {open ? (
            <div
              role="menu"
              aria-label={t('attendance.noShow.action')}
              className="absolute top-full z-30 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
              style={{ insetInlineEnd: 0 }}
            >
              <button
                type="button"
                role="menuitem"
                autoFocus
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  if (isNoted) onUndo?.();
                  else onNote?.();
                }}
                className="flex min-h-[44px] w-full items-center rounded-md px-3 text-start text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {isNoted ? t('attendance.noShow.undoAction') : t('attendance.noShow.action')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
