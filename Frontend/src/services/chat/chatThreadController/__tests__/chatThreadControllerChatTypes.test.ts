import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatContextType } from '@/api/chat';
import type { ChatType, Game } from '@/types';
import { ChatThreadController } from '../ChatThreadController';
import { buildGameChatMarkReadParams } from '@/services/chat/gameChatMarkReadParams';
import { resolveThreadKey } from '@/services/chat/threadSession';
import { cancelAllForContext } from '@/services/chatSendService';
import { reconcileThreadIndexOutboxForContext } from '@/services/chat/chatThreadIndex';
import {
  enterContextAndMarkRead,
  markContextReadOnUserActivity,
} from '@/services/chat/unreadCoordinator';

vi.mock('@/services/chatSendService', () => ({
  cancelAllForContext: vi.fn(),
}));

vi.mock('@/services/chat/chatThreadIndex', () => ({
  reconcileThreadIndexOutboxForContext: vi.fn(async () => {}),
}));

vi.mock('@/services/chat/unreadCoordinator', () => ({
  enterContextAndMarkRead: vi.fn(async () => {}),
  markContextReadOnUserActivity: vi.fn(),
}));

type HookOpenParams = {
  id: string;
  contextType: ChatContextType;
  effectiveChatType?: ChatType;
  isEmbedded?: boolean;
  freshOpenSignal?: number;
  openAnchorMessageId?: string;
};

/** Mirrors useChatThreadController layout-effect open(). */
function openLikeHook(controller: ChatThreadController, opts: HookOpenParams): string | null {
  return controller.open({
    contextType: opts.contextType,
    contextId: opts.id,
    chatType: opts.contextType === 'GAME' ? opts.effectiveChatType : undefined,
    forceReload: opts.freshOpenSignal,
    anchorMessageId: opts.openAnchorMessageId,
    isEmbedded: opts.isEmbedded,
  });
}

/** Mirrors useChatThreadController markRead callback. */
function markReadLikeHook(
  controller: ChatThreadController,
  opts: {
    id: string | undefined;
    contextType: ChatContextType;
    userId: string | undefined;
    game: Game | null;
    effectiveChatType: ChatType;
    groupChannelId?: string;
  }
): void {
  controller.markRead({
    id: opts.id,
    contextType: opts.contextType,
    game: opts.game,
    userId: opts.userId,
    gameChatType: opts.effectiveChatType,
    groupChannelId: opts.groupChannelId,
  });
}

function participantGame(userId: string): Game {
  return {
    id: 'g1',
    status: 'OPEN',
    isPublic: true,
    participants: [{ userId, status: 'PLAYING', role: 'PLAYER' }],
  } as Game;
}

describe('ChatThreadController — chat types (hook contract)', () => {
  let controller: ChatThreadController;

  beforeEach(() => {
    controller = new ChatThreadController();
    vi.mocked(cancelAllForContext).mockClear();
    vi.mocked(reconcileThreadIndexOutboxForContext).mockClear();
    vi.mocked(enterContextAndMarkRead).mockClear();
    vi.mocked(markContextReadOnUserActivity).mockClear();
  });

  describe('USER chat', () => {
    it('opens with USER thread key', () => {
      const key = openLikeHook(controller, { id: 'uc1', contextType: 'USER' });
      expect(key).toBe('USER:uc1');
      expect(controller.getState().openContext).toMatchObject({
        contextType: 'USER',
        contextId: 'uc1',
        isEmbedded: undefined,
      });
    });

    it('markReadOnEnter delegates USER params', () => {
      controller.markReadOnEnter({ id: 'uc1', contextType: 'USER', userId: 'u1' });
      expect(enterContextAndMarkRead).toHaveBeenCalledWith({
        contextType: 'USER',
        contextId: 'uc1',
        rawContextType: 'USER',
      });
    });

    it('close reconciles USER outbox', () => {
      openLikeHook(controller, { id: 'uc1', contextType: 'USER' });
      controller.close();
      expect(cancelAllForContext).toHaveBeenCalledWith('USER', 'uc1');
      expect(reconcileThreadIndexOutboxForContext).toHaveBeenCalledWith('USER', 'uc1');
    });
  });

  describe('GAME chat', () => {
    it('opens PUBLIC game thread key', () => {
      const key = openLikeHook(controller, {
        id: 'g1',
        contextType: 'GAME',
        effectiveChatType: 'PUBLIC',
      });
      expect(key).toBe('GAME:g1:PUBLIC');
      expect(controller.chatType()).toBe('PUBLIC');
    });

    it('opens PRIVATE game thread key and accepts matching socket key', () => {
      openLikeHook(controller, {
        id: 'g1',
        contextType: 'GAME',
        effectiveChatType: 'PRIVATE',
      });
      expect(controller.acceptsThreadKey('GAME:g1:PRIVATE')).toBe(true);
      expect(controller.acceptsThreadKey('GAME:g1:PUBLIC')).toBe(false);
    });

    it('stores isEmbedded for embedded game details side panel', () => {
      openLikeHook(controller, {
        id: 'g1',
        contextType: 'GAME',
        effectiveChatType: 'PUBLIC',
        isEmbedded: true,
      });
      expect(controller.getState().openContext?.isEmbedded).toBe(true);
      expect(controller.contextType()).toBe('GAME');
    });

    it('markRead delegates GAME params with participant game', () => {
      const game = participantGame('u1');
      markReadLikeHook(controller, {
        id: 'g1',
        contextType: 'GAME',
        userId: 'u1',
        game,
        effectiveChatType: 'PRIVATE',
      });
      expect(markContextReadOnUserActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          contextType: 'GAME',
          contextId: 'g1',
          gameChatType: 'PRIVATE',
        })
      );
    });

    it('close reconciles GAME outbox', () => {
      openLikeHook(controller, { id: 'g1', contextType: 'GAME', effectiveChatType: 'ADMINS' });
      controller.close();
      expect(reconcileThreadIndexOutboxForContext).toHaveBeenCalledWith('GAME', 'g1');
    });
  });

  describe('GROUP chat', () => {
    it('opens GROUP thread key without chat type suffix', () => {
      const key = openLikeHook(controller, { id: 'grp1', contextType: 'GROUP' });
      expect(key).toBe('GROUP:grp1');
      expect(resolveThreadKey('GROUP', 'grp1')).toBe('GROUP:grp1');
    });

    it('markReadOnEnter delegates GROUP params', () => {
      controller.markReadOnEnter({ id: 'grp1', contextType: 'GROUP', userId: 'u1' });
      expect(enterContextAndMarkRead).toHaveBeenCalledWith({
        contextType: 'GROUP',
        contextId: 'grp1',
        rawContextType: 'GROUP',
      });
    });

    it('close reconciles GROUP outbox', () => {
      openLikeHook(controller, { id: 'grp1', contextType: 'GROUP' });
      controller.close();
      expect(reconcileThreadIndexOutboxForContext).toHaveBeenCalledWith('GROUP', 'grp1');
    });
  });

  describe('channel chat (GROUP + isChannel)', () => {
    it('uses GROUP context type at controller layer', () => {
      const key = openLikeHook(controller, { id: 'ch1', contextType: 'GROUP' });
      expect(key).toBe('GROUP:ch1');
      expect(controller.contextType()).toBe('GROUP');
    });

    it('markRead with groupChannelId for BUG raw context maps to GROUP coordinator', () => {
      controller.markReadOnEnter({
        id: 'bug1',
        contextType: 'BUG',
        userId: 'u1',
        groupChannelId: 'ch-bug',
      });
      expect(enterContextAndMarkRead).toHaveBeenCalledWith({
        contextType: 'GROUP',
        contextId: 'bug1',
        rawContextType: 'BUG',
        groupChannelId: 'ch-bug',
      });
    });

    it('close reconciles BUG outbox by raw context type', () => {
      controller.open({ contextType: 'BUG', contextId: 'bug1' });
      controller.close();
      expect(reconcileThreadIndexOutboxForContext).toHaveBeenCalledWith('BUG', 'bug1');
    });
  });

  describe('context switch (useChatThreadController teardown)', () => {
    it('close on switch returns prior context for re-bootstrap', () => {
      openLikeHook(controller, { id: 'uc1', contextType: 'USER' });
      const closed = controller.close();
      expect(closed).toEqual({ contextType: 'USER', contextId: 'uc1' });

      const next = new ChatThreadController();
      openLikeHook(next, { id: 'g1', contextType: 'GAME', effectiveChatType: 'PUBLIC' });
      expect(next.getState().threadKey).toBe('GAME:g1:PUBLIC');
    });

    it('syncMessageCount tracks list length after open', () => {
      openLikeHook(controller, { id: 'g1', contextType: 'GAME', effectiveChatType: 'PUBLIC' });
      controller.markOpenReady(0);
      controller.syncMessageCount(5);
      expect(controller.getState().messageCount).toBe(5);
    });
  });
});

describe('buildGameChatMarkReadParams — per chat type', () => {
  it('returns null without id or userId', () => {
    expect(buildGameChatMarkReadParams({ id: undefined, contextType: 'USER', game: null, userId: 'u1', gameChatType: 'PUBLIC' })).toBeNull();
    expect(buildGameChatMarkReadParams({ id: 'x', contextType: 'USER', game: null, userId: undefined, gameChatType: 'PUBLIC' })).toBeNull();
  });

  it('builds USER mark-read params', () => {
    expect(buildGameChatMarkReadParams({ id: 'uc1', contextType: 'USER', game: null, userId: 'u1', gameChatType: 'PUBLIC' })).toEqual({
      contextType: 'USER',
      contextId: 'uc1',
      rawContextType: 'USER',
    });
  });

  it('builds GROUP mark-read params', () => {
    expect(buildGameChatMarkReadParams({ id: 'grp1', contextType: 'GROUP', game: null, userId: 'u1', gameChatType: 'PUBLIC' })).toEqual({
      contextType: 'GROUP',
      contextId: 'grp1',
      rawContextType: 'GROUP',
    });
  });

  it('builds GAME mark-read params for participant', () => {
    const game = participantGame('u1');
    const params = buildGameChatMarkReadParams({
      id: 'g1',
      contextType: 'GAME',
      game,
      userId: 'u1',
      gameChatType: 'ADMINS',
    });
    expect(params).toMatchObject({
      contextType: 'GAME',
      contextId: 'g1',
      gameChatType: 'ADMINS',
    });
  });

  it('returns null for GAME when game missing', () => {
    expect(
      buildGameChatMarkReadParams({ id: 'g1', contextType: 'GAME', game: null, userId: 'u1', gameChatType: 'PUBLIC' })
    ).toBeNull();
  });
});
