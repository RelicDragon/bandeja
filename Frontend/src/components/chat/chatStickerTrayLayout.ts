/**
 * Expand sticker/GIF tray to fill space above the software keyboard.
 *
 * Once search is used on a software-keyboard UI (Capacitor or coarse pointer),
 * stay expanded until the tray closes. That covers:
 * - Capacitor (Keyboard.resize none): overlay lifts; flex-1 fills remaining height
 * - Mobile browser native-resize: keyboardVisible stays false; flex-1 fills shrunk viewport
 * - Blur → tap result: no mid-gesture collapse
 *
 * Desktop fine pointer stays compact unless the OS reports a software keyboard.
 */
export function shouldExpandChatStickerTray(opts: {
  searchActivated: boolean;
  keyboardVisible: boolean;
  softwareKeyboardUi: boolean;
}): boolean {
  if (!opts.searchActivated) return false;
  if (opts.softwareKeyboardUi) return true;
  return opts.keyboardVisible;
}

export function chatStickerTrayPanelHeightClass(expanded: boolean): string {
  return expanded
    ? 'min-h-0 flex-1'
    : 'h-[min(76dvh,36rem)] max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] shrink-0';
}
