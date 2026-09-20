import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

/**
 * PRD 346 — "What the dots mean", as a control that actually exists on a phone.
 *
 * The dots themselves only ever offered `contextmenu`, which WebKit does not
 * dispatch for touch (and `.capacitor-app` already suppresses the long-press
 * callout), so on iOS the legend could not be opened at all. The dot is now
 * pressable too, but it is a 14–16 px glyph pinned to an avatar corner; this is
 * the 44 px, keyboard-reachable, screen-reader-announced way in.
 */
export function AttendanceLegendButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="attendance-legend-button"
      className="-ms-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <Info size={14} aria-hidden />
      {t('attendance.legend.title')}
    </button>
  );
}
