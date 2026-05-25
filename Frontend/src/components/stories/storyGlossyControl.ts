/** Glossy frosted controls for story overlays (readable on light or dark slide media). */
export const STORY_GLOSSY_SURFACE = [
  'border border-white/30 bg-white/15 text-white',
  'backdrop-blur-xl',
  'shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)]',
  'drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
  'transition-colors',
].join(' ');

/** Full-width CTA (e.g. view results). */
export const STORY_GLOSSY_CTA_CLASS = [
  STORY_GLOSSY_SURFACE,
  'w-full rounded-2xl px-4 py-3.5 text-sm font-semibold',
  'hover:bg-white/22 active:bg-white/18',
].join(' ');

/** Circular / rail icon control — denser frosted bg, no sticky touch hover. */
export const STORY_GLOSSY_ICON_BTN = [
  'border border-white/35 bg-white/40 text-white',
  'backdrop-blur-xl',
  'shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)]',
  'drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
  'transition-colors',
  'outline-none [-webkit-tap-highlight-color:transparent]',
  'hover:bg-white/40 active:bg-white/45',
  'focus:bg-white/40 focus:backdrop-blur-xl',
  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40',
].join(' ');
