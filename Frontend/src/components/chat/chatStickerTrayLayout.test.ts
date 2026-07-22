import { describe, expect, it } from 'vitest';
import {
  chatStickerTrayPanelHeightClass,
  shouldExpandChatStickerTray,
} from '@/components/chat/chatStickerTrayLayout';

describe('shouldExpandChatStickerTray', () => {
  it('expands when search is focused', () => {
    expect(shouldExpandChatStickerTray({ searchFocused: true, keyboardVisible: false })).toBe(true);
  });

  it('expands when keyboard is visible (Capacitor / manual lift)', () => {
    expect(shouldExpandChatStickerTray({ searchFocused: false, keyboardVisible: true })).toBe(true);
  });

  it('stays compact when idle', () => {
    expect(shouldExpandChatStickerTray({ searchFocused: false, keyboardVisible: false })).toBe(false);
  });
});

describe('chatStickerTrayPanelHeightClass', () => {
  it('uses full height when expanded', () => {
    expect(chatStickerTrayPanelHeightClass(true)).toContain('flex-1');
  });

  it('uses compact height when collapsed', () => {
    expect(chatStickerTrayPanelHeightClass(false)).toContain('76dvh');
  });
});
