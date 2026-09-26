/*
 * Visual tokens for the manual score-entry dialog. Neutrals use gray-* and
 * accents primary-*, so the Premium palette re-skins it without overrides.
 */

/** Fast start, long soft landing. Every transition in the dialog uses it. */
export const SCORE_ENTRY_EASE = [0.32, 0.72, 0, 1] as const;

export const SCORE_ENTRY_SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const;

export const EASE_CLASS = 'ease-[cubic-bezier(0.32,0.72,0,1)]';

/** Outer tray of a two-layer surface: a faint recess with a hairline edge. */
export const TRAY_CLASS =
  'rounded-[1.75rem] bg-gray-900/[0.035] p-1.5 ring-1 ring-inset ring-gray-900/[0.05] dark:bg-black/25 dark:ring-white/[0.06]';

/** Raised plate inside TRAY_CLASS. Radius is concentric: 1.75rem minus the tray's p-1.5. */
export const TRAY_PLATE_CLASS =
  'rounded-[calc(1.75rem-0.375rem)] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-18px_rgba(15,23,42,0.22)] dark:bg-gray-800/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_28px_-18px_rgba(0,0,0,0.7)]';

/** Soft circular / pill control with no border (steppers, close, secondary actions). Callers set the text colour. */
export const SOFT_CONTROL_CLASS = `bg-gray-900/[0.045] transition-[transform,background-color,color,opacity] duration-300 ${EASE_CLASS} hover:bg-gray-900/[0.08] active:scale-[0.94] active:bg-gray-900/[0.1] disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:active:bg-white/[0.14]`;

/** Stacked faces separated by a cut-out ring in the surface colour behind them. */
export const FACE_CUTOUT_CLASS = 'inline-flex rounded-full ring-2';
