/**
 * PRD 346 — the status dot on a PLAYING player's avatar.
 *
 * Colour is never the only signal: the dot always renders a visually-hidden
 * text equivalent, and the confirmed / unsure states also differ in shape
 * (check vs question mark vs empty ring).
 *
 * When a legend handler is passed the dot becomes a real `<button>`: it used to
 * listen for `contextmenu` only, which WebKit does not dispatch for touch — and
 * `.capacitor-app` suppresses the long-press callout anyway — so on iOS the
 * legend it advertised could never be opened, and a keyboard user could not
 * reach it either. `AttendanceLegendButton` is the 44 px companion control; this
 * one is the shortcut for people who press the dot they are asking about.
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { attendanceDotStyle, type AttendanceDotState } from './attendanceVisuals';

export interface AttendanceDotProps {
  state: AttendanceDotState;
  /** `sm` sits on a carousel avatar, `md` on a list row avatar. */
  size?: 'sm' | 'md';
  className?: string;
  /** Press / long-press handler that opens the legend. */
  onRequestLegend?: () => void;
}

const SIZES = {
  sm: 'h-3.5 w-3.5 text-[8px]',
  md: 'h-4 w-4 text-[9px]',
} as const;

function AttendanceDotInner({ state, size = 'sm', className = '', onRequestLegend }: AttendanceDotProps) {
  const { t } = useTranslation();
  const style = attendanceDotStyle(state);
  const label = t(style.labelKey);

  const shared = `absolute -bottom-0.5 inline-flex items-center justify-center rounded-full ring-2 ring-white dark:ring-gray-900 ${SIZES[size]} ${style.className} ${className}`;
  const glyph = (
    <>
      {state === 'CONFIRMED' ? <Check size={9} strokeWidth={3.5} aria-hidden /> : null}
      {state === 'UNSURE' ? (
        <span aria-hidden className="font-bold leading-none">
          ?
        </span>
      ) : null}
    </>
  );

  if (!onRequestLegend) {
    return (
      <span
        className={`pointer-events-none ${shared}`}
        style={{ insetInlineEnd: '-2px' }}
        data-attendance-state={state}
      >
        {glyph}
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      // `after:` grows the touch region past the 14–16 px glyph without moving
      // any layout; the avatar underneath keeps the rest of its own area.
      className={`${shared} after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-primary-500`}
      style={{ insetInlineEnd: '-2px' }}
      data-attendance-state={state}
      aria-label={`${label}. ${t('attendance.legend.title')}`}
      onClick={(event) => {
        // The avatar behind the dot opens a player card; the dot is its own
        // control and must not trigger it.
        event.preventDefault();
        event.stopPropagation();
        onRequestLegend();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRequestLegend();
      }}
    >
      {glyph}
    </button>
  );
}

export const AttendanceDot = memo(AttendanceDotInner);
