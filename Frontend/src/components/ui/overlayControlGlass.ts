/** Frosted overlay controls: light frosted pill in light theme, dark glass in dark theme. */
export const OVERLAY_CONTROL_GLASS = [
  'border border-black/15',
  'shadow-[0_4px_14px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.18)]',
  'dark:border-white/20',
  'dark:shadow-[0_4px_14px_rgba(0,0,0,0.5),0_12px_36px_rgba(0,0,0,0.55)]',
  'bg-white/82 text-gray-900 hover:bg-white/95',
  'dark:bg-black/60 dark:text-white dark:hover:bg-black/80',
  'backdrop-blur-sm transition-all duration-200',
].join(' ');

/** Same glass look on hover/active (no stronger tint) — avoids touch sticky-hover looking opaque vs frosted. */
export const OVERLAY_CONTROL_GLASS_STABLE = [
  'border border-black/15',
  'shadow-[0_4px_14px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.18)]',
  'dark:border-white/20',
  'dark:shadow-[0_4px_14px_rgba(0,0,0,0.5),0_12px_36px_rgba(0,0,0,0.55)]',
  'bg-white/82 text-gray-900 hover:bg-white/82 active:bg-white/82',
  'dark:bg-black/60 dark:text-white dark:hover:bg-black/60 dark:active:bg-black/60',
  'backdrop-blur-sm transition-all duration-200',
].join(' ');
