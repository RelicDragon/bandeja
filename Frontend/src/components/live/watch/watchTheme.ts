/**
 * Shared look of the watch page (`GameWatchPage`): one easing curve for every
 * transition and the double-bezel card — a hairline tray (`shell`) holding the
 * content plate (`core`) with a concentric, smaller radius.
 */
export const WATCH_EASE = 'ease-[cubic-bezier(0.32,0.72,0,1)]';

export function watchBezel(light: boolean): { shell: string; core: string } {
  return {
    shell: light
      ? 'rounded-[2rem] bg-black/[0.03] p-1.5 ring-1 ring-black/[0.06] shadow-[0_40px_90px_-40px_rgba(15,23,42,0.35)]'
      : 'rounded-[2rem] bg-white/[0.04] p-1.5 ring-1 ring-white/[0.08] shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)]',
    core: 'rounded-[calc(2rem-0.375rem)]',
  };
}
