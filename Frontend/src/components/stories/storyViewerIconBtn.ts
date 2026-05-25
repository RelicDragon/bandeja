/** Plain circular icon controls (like / comment / close) on story viewer overlays. */
export const STORY_VIEWER_ICON_BTN = [
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
  'text-white outline-none [-webkit-tap-highlight-color:transparent]',
  'transition-transform active:scale-95',
].join(' ');

export function storyViewerCommentIconClass(viewerHasCommented: boolean): string {
  return viewerHasCommented ? 'fill-sky-400 text-sky-400' : 'text-white';
}
