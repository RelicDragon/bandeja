import { describe, expect, it } from 'vitest';
import {
  buildChatSelectPath,
  desktopRightPanelTransition,
  isChatPanelPathSynced,
  isChatPanelReady,
  shouldRenderEmbeddedGameChat,
} from '../chatsTabShell';

describe('chatsTabShell', () => {
  describe('buildChatSelectPath', () => {
    it('keeps market filter (and role/item) when opening a market channel chat', () => {
      expect(buildChatSelectPath('c1', 'channel', 'market')).toBe(
        '/channel-chat/c1?filter=market'
      );
      expect(
        buildChatSelectPath('c1', 'channel', 'market', { role: 'buyer', item: 'i9' })
      ).toBe('/channel-chat/c1?filter=market&role=buyer&item=i9');
    });

    it('uses plain channel path for Channels tab', () => {
      expect(buildChatSelectPath('c1', 'channel', 'channels')).toBe('/channel-chat/c1');
    });

    it('uses bugs path for Bugs tab channel chats', () => {
      expect(buildChatSelectPath('b1', 'channel', 'bugs')).toBe('/bugs/b1');
    });
  });

  describe('shouldRenderEmbeddedGameChat', () => {
    it('renders when selection is set', () => {
      expect(shouldRenderEmbeddedGameChat('a', 'user')).toBe(true);
    });
    it('does not render without selection', () => {
      expect(shouldRenderEmbeddedGameChat(null, 'user')).toBe(false);
      expect(shouldRenderEmbeddedGameChat('a', null)).toBe(false);
    });
  });

  describe('isChatPanelReady', () => {
    it('is always ready on mobile', () => {
      expect(
        isChatPanelReady(false, 'x', 'user', { id: null, type: null })
      ).toBe(true);
    });
    it('is ready when path matches selection on desktop', () => {
      expect(
        isChatPanelReady(true, 'x', 'user', { id: 'x', type: 'user' })
      ).toBe(true);
    });
    it('is not ready when path lags selection on desktop', () => {
      expect(
        isChatPanelReady(true, 'x', 'user', { id: 'y', type: 'user' })
      ).toBe(false);
    });
  });

  describe('desktopRightPanelTransition', () => {
    it('no overlay when idle', () => {
      expect(desktopRightPanelTransition(false, true)).toEqual({
        showOverlay: false,
        hideContent: false,
      });
    });
    it('clears overlay once path synced even if flag still set', () => {
      expect(desktopRightPanelTransition(true, true)).toEqual({
        showOverlay: false,
        hideContent: false,
      });
    });
    it('short overlay without hiding content while URL catches up', () => {
      expect(desktopRightPanelTransition(true, false)).toEqual({
        showOverlay: true,
        hideContent: false,
      });
    });
  });

  describe('isChatPanelPathSynced', () => {
    it('requires id and type match', () => {
      expect(isChatPanelPathSynced({ id: '1', type: 'game' }, '1', 'game')).toBe(true);
      expect(isChatPanelPathSynced({ id: '1', type: 'user' }, '1', 'game')).toBe(false);
    });
  });
});
