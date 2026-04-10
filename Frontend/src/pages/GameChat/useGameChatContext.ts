import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { chatApi } from '@/api/chat';
import { gamesApi } from '@/api/games';
import { usePlayersStore } from '@/store/playersStore';
import type { ChatContextType, UserChat as UserChatType, GroupChannel } from '@/api/chat';
import type { Game, Bug } from '@/types';
import {
  loadGroupChannelStubFromThreadIndex,
  loadUserChatStubFromThreadIndex,
} from '@/services/chat/chatThreadIndex';
import {
  isTrustedGroupChannelOpenContext,
  isTrustedUserChatOpenContext,
} from '@/services/chat/chatOpenContextValidation';

function shouldBounceFromHttpError(error: unknown): boolean {
  const s = (error as { response?: { status?: number } })?.response?.status;
  return s === 404 || s === 403 || s === 410;
}

export interface UseGameChatContextParams {
  id: string | undefined;
  contextType: ChatContextType;
  isEmbedded: boolean;
  initialUserChat: UserChatType | null | undefined;
  initialGroupChannel: GroupChannel | null | undefined;
  currentUserId: string | undefined;
  navigate: NavigateFunction;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  currentIdRef: RefObject<string | undefined>;
}

export function useGameChatContext({
  id,
  contextType,
  isEmbedded,
  initialUserChat,
  initialGroupChannel,
  currentUserId,
  navigate,
  setChatsFilter,
  currentIdRef,
}: UseGameChatContextParams) {
  const [game, setGame] = useState<Game | null>(null);
  const [bug, setBug] = useState<Bug | null>(null);
  const [userChat, setUserChat] = useState<UserChatType | null>(() =>
    initialUserChat && isTrustedUserChatOpenContext(initialUserChat, id, currentUserId)
      ? initialUserChat
      : null
  );
  const [groupChannel, setGroupChannel] = useState<GroupChannel | null>(() =>
    initialGroupChannel && isTrustedGroupChannelOpenContext(initialGroupChannel, id, currentUserId)
      ? initialGroupChannel
      : null
  );
  const [groupChannelParticipantsCount, setGroupChannelParticipantsCount] = useState<number>(() => {
    const g =
      initialGroupChannel && isTrustedGroupChannelOpenContext(initialGroupChannel, id, currentUserId)
        ? initialGroupChannel
        : null;
    return g?.participantsCount || 0;
  });
  const [isLoadingContext, setIsLoadingContext] = useState(!isEmbedded);

  const userChatRef = useRef(userChat);
  const groupChannelRef = useRef(groupChannel);
  userChatRef.current = userChat;
  groupChannelRef.current = groupChannel;

  const loadContext = useCallback(async () => {
    if (!id) {
      if (!isEmbedded) setIsLoadingContext(false);
      return null;
    }
    const requestId = id;
    try {
      if (contextType === 'GAME') {
        const response = await gamesApi.getById(id);
        if (currentIdRef.current !== requestId) return null;
        setGame(response.data);
        return response.data;
      }
      if (contextType === 'USER') {
        if (userChatRef.current?.id === id) return userChatRef.current;
        if (
          initialUserChat?.id === id &&
          isTrustedUserChatOpenContext(initialUserChat, id, currentUserId)
        ) {
          setUserChat(initialUserChat);
          return initialUserChat;
        }
        const { fetchUserChats, getChatById } = usePlayersStore.getState();
        const cached = getChatById(id);
        if (cached && isTrustedUserChatOpenContext(cached, id, currentUserId)) {
          setUserChat(cached);
          return cached;
        }
        await fetchUserChats();
        if (currentIdRef.current !== requestId) return null;
        const afterFetch = getChatById(id);
        if (afterFetch && isTrustedUserChatOpenContext(afterFetch, id, currentUserId)) {
          setUserChat(afterFetch);
          return afterFetch;
        }
        const fromDex = await loadUserChatStubFromThreadIndex(id);
        if (currentIdRef.current !== requestId) return null;
        if (fromDex) {
          setUserChat(fromDex);
          return fromDex;
        }
        return null;
      }
      if (contextType === 'GROUP') {
        if (groupChannelRef.current?.id === id) return groupChannelRef.current;
        if (
          initialGroupChannel?.id === id &&
          isTrustedGroupChannelOpenContext(initialGroupChannel, id, currentUserId)
        ) {
          setGroupChannel(initialGroupChannel);
          setGroupChannelParticipantsCount(initialGroupChannel.participantsCount || 0);
          if (initialGroupChannel.bug) {
            setBug(initialGroupChannel.bug as Bug);
          }
          return initialGroupChannel;
        }
        const response = await chatApi.getGroupChannelById(id);
        if (currentIdRef.current !== requestId) return null;
        setGroupChannel(response.data);
        setGroupChannelParticipantsCount(response.data.participantsCount || 0);
        if (response.data.bug) {
          setBug(response.data.bug as Bug);
        }
        return response.data;
      }
      return null;
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { cancelled?: boolean } } };
      if (contextType === 'GAME' && err.response?.status === 410 && err.response?.data?.cancelled) {
        setGame(null);
      }
      console.error('Failed to load context:', error);
      if (currentIdRef.current === requestId && !isEmbedded && shouldBounceFromHttpError(error)) {
        if (contextType === 'GROUP') {
          const isBugChat = window.location.pathname.match(/^\/bugs\/[^/]+$/);
          if (isBugChat) {
            setChatsFilter('bugs');
            navigate('/bugs', { replace: true });
          } else {
            setChatsFilter('channels');
            navigate('/chats', { replace: true });
          }
        } else if (contextType === 'USER') {
          setChatsFilter('users');
          navigate('/chats', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
        return null;
      }
      if (currentIdRef.current === requestId && contextType === 'GROUP') {
        const stub = await loadGroupChannelStubFromThreadIndex(id);
        if (
          stub &&
          currentIdRef.current === requestId &&
          isTrustedGroupChannelOpenContext(stub, id, currentUserId)
        ) {
          setGroupChannel(stub);
          setGroupChannelParticipantsCount(stub.participantsCount || 0);
          if (stub.bug) {
            setBug(stub.bug as Bug);
          }
          return stub;
        }
      }
      return null;
    } finally {
      if (currentIdRef.current === requestId) setIsLoadingContext(false);
    }
  }, [
    id,
    contextType,
    navigate,
    isEmbedded,
    setChatsFilter,
    currentIdRef,
    initialUserChat,
    initialGroupChannel,
    currentUserId,
  ]);

  useEffect(() => {
    if (!initialUserChat || initialUserChat.id !== id || !isTrustedUserChatOpenContext(initialUserChat, id, currentUserId)) {
      return;
    }
    setUserChat((prev) => (prev?.id === id ? prev : initialUserChat));
  }, [id, initialUserChat, currentUserId]);

  useEffect(() => {
    if (
      !initialGroupChannel ||
      initialGroupChannel.id !== id ||
      !isTrustedGroupChannelOpenContext(initialGroupChannel, id, currentUserId)
    ) {
      return;
    }
    setGroupChannel((prev) => (prev?.id === id ? prev : initialGroupChannel));
  }, [id, initialGroupChannel, currentUserId]);

  useEffect(() => {
    const g = groupChannel;
    if (!g || g.id !== id) return;
    setGroupChannelParticipantsCount(g.participantsCount || 0);
    if (g.bug) setBug(g.bug as Bug);
  }, [groupChannel, id]);

  return {
    game,
    setGame,
    bug,
    setBug,
    userChat,
    setUserChat,
    groupChannel,
    setGroupChannel,
    groupChannelParticipantsCount,
    setGroupChannelParticipantsCount,
    isLoadingContext,
    setIsLoadingContext,
    loadContext,
  };
}
