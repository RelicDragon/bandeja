/** Expand tray to fill space above keyboard when search is active or keyboard is shown. */
export function shouldExpandChatStickerTray(opts: {
  searchFocused: boolean;
  keyboardVisible: boolean;
}): boolean {
  return opts.searchFocused || opts.keyboardVisible;
}

export function chatStickerTrayPanelHeightClass(expanded: boolean): string {
  return expanded
    ? 'min-h-0 flex-1'
    : 'h-[min(76dvh,36rem)] max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)]';
}
