import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi, type ChatMessage } from '@/api/chat';
import {
  chatMessageActivatesGameChannel,
  EMPTY_GAME_CHAT_CHANNEL_ACTIVITY,
  gameChatChannelIsActive,
  type GameChatChannelActivity,
} from '@/utils/gameChatChannelActivity';
import { getAvailableGameChatTypes } from '@/utils/chatType';
import type { Game } from '@/types';

export function useThreadChannelActivity(game: Game | null, userId: string | undefined) {
  const [activity, setActivity] = useState<GameChatChannelActivity>(EMPTY_GAME_CHAT_CHANNEL_ACTIVITY);
  const [isResolved, setIsResolved] = useState(false);
  const gameId = game?.id;

  useEffect(() => {
    setIsResolved(false);
    if (!gameId || !userId || !game) {
      setActivity(EMPTY_GAME_CHAT_CHANNEL_ACTIVITY);
      setIsResolved(true);
      return;
    }

    const participant = game.participants?.find((p) => p.userId === userId);
    const parentParticipant = game.parent?.participants?.find((p) => p.userId === userId);
    const eligible = getAvailableGameChatTypes(participant ?? undefined, parentParticipant ?? undefined);
    const toProbe = (['PRIVATE', 'ADMINS'] as const).filter((t) => eligible.includes(t));

    if (toProbe.length === 0) {
      setActivity(EMPTY_GAME_CHAT_CHANNEL_ACTIVITY);
      setIsResolved(true);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();

    void (async () => {
      const results = await Promise.all(
        toProbe.map(async (chatType) => {
          try {
            const messages = await chatApi.getGameMessages(gameId, 1, 50, chatType);
            return { chatType, active: gameChatChannelIsActive(messages, chatType) };
          } catch {
            return { chatType, active: false };
          }
        })
      );
      if (cancelled || ac.signal.aborted) return;

      const next: GameChatChannelActivity = { ...EMPTY_GAME_CHAT_CHANNEL_ACTIVITY };
      for (const { chatType, active } of results) {
        if (chatType === 'PRIVATE') next.privateHasUserMessages = active;
        if (chatType === 'ADMINS') next.adminsHasUserMessages = active;
      }
      setActivity(next);
      setIsResolved(true);
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [gameId, userId, game]);

  const activityRef = useRef(activity);
  activityRef.current = activity;

  const noteUserMessage = useCallback((message: ChatMessage) => {
    const activated = chatMessageActivatesGameChannel(message);
    if (!activated) return;
    if (activated === 'PRIVATE' && activityRef.current.privateHasUserMessages) return;
    if (activated === 'ADMINS' && activityRef.current.adminsHasUserMessages) return;
    setActivity((prev) => ({
      privateHasUserMessages: prev.privateHasUserMessages || activated === 'PRIVATE',
      adminsHasUserMessages: prev.adminsHasUserMessages || activated === 'ADMINS',
    }));
  }, []);

  return { channelActivity: activity, channelActivityResolved: isResolved, noteUserMessage };
}
