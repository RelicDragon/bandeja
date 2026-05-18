import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi, type ChatMessage } from '@/api/chat';
import {
  chatMessagesHaveUserSender,
  EMPTY_GAME_CHAT_CHANNEL_ACTIVITY,
  type GameChatChannelActivity,
} from '@/utils/gameChatChannelActivity';
import { getAvailableGameChatTypes } from '@/utils/chatType';
import type { ChatType } from '@/types';
import type { Game } from '@/types';

export function useGameChatChannelActivity(game: Game | null, userId: string | undefined) {
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
            return { chatType, hasUser: chatMessagesHaveUserSender(messages) };
          } catch {
            return { chatType, hasUser: false };
          }
        })
      );
      if (cancelled || ac.signal.aborted) return;

      const next: GameChatChannelActivity = { ...EMPTY_GAME_CHAT_CHANNEL_ACTIVITY };
      for (const { chatType, hasUser } of results) {
        if (chatType === 'PRIVATE') next.privateHasUserMessages = hasUser;
        if (chatType === 'ADMINS') next.adminsHasUserMessages = hasUser;
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
    if (!message.senderId) return;
    const chatType = message.chatType as ChatType | undefined;
    if (chatType !== 'PRIVATE' && chatType !== 'ADMINS') return;
    if (chatType === 'PRIVATE' && activityRef.current.privateHasUserMessages) return;
    if (chatType === 'ADMINS' && activityRef.current.adminsHasUserMessages) return;
    setActivity((prev) => ({
      privateHasUserMessages: prev.privateHasUserMessages || chatType === 'PRIVATE',
      adminsHasUserMessages: prev.adminsHasUserMessages || chatType === 'ADMINS',
    }));
  }, []);

  return { channelActivity: activity, channelActivityResolved: isResolved, noteUserMessage };
}
