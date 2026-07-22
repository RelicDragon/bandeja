import { describe, expect, it } from 'vitest';
import {
  chatStickerTrayPanelHeightClass,
  shouldExpandChatStickerTray,
} from '@/components/chat/chatStickerTrayLayout';

describe('shouldExpandChatStickerTray', () => {
  it('stays compact before search is used', () => {
    expect(
      shouldExpandChatStickerTray({
        searchActivated: false,
        keyboardVisible: true,
        softwareKeyboardUi: true,
      })
    ).toBe(false);
  });

  it('expands for the rest of the open on software-keyboard UI after search', () => {
    expect(
      shouldExpandChatStickerTray({
        searchActivated: true,
        keyboardVisible: false,
        softwareKeyboardUi: true,
      })
    ).toBe(true);
  });

  it('stays compact on desktop after search without a software keyboard', () => {
    expect(
      shouldExpandChatStickerTray({
        searchActivated: true,
        keyboardVisible: false,
        softwareKeyboardUi: false,
      })
    ).toBe(false);
  });

  it('expands on desktop only when OS reports a software keyboard', () => {
    expect(
      shouldExpandChatStickerTray({
        searchActivated: true,
        keyboardVisible: true,
        softwareKeyboardUi: false,
      })
    ).toBe(true);
  });
});

describe('chatStickerTrayPanelHeightClass', () => {
  it('uses flex-1 when expanded', () => {
    expect(chatStickerTrayPanelHeightClass(true)).toContain('flex-1');
    expect(chatStickerTrayPanelHeightClass(true)).toContain('min-h-0');
  });

  it('uses compact height when collapsed', () => {
    expect(chatStickerTrayPanelHeightClass(false)).toContain('76dvh');
    expect(chatStickerTrayPanelHeightClass(false)).toContain('shrink-0');
  });
});
