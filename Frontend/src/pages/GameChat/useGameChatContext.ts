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
import { mergeGroupChannelFromApi } from '@/utils/groupChannelParticipation';
import {
  archivedMetaFrom410,
  buildArchivedGameStub,
  isCancelledGame410Payload,
  type ArchivedGameChatMeta,
} from '@/utils/cancelledGameChatStub';
import { hydrateThreadArchivedMemory, markThreadArchivedInMemory } from '@/services/chat/chatThreadLifecycle';
import { resolveLoadedGameChatArchiveState } from './gameChatArchiveState';

function shouldBounceFromHttpError(error: unknown): boolean {
  const s = (error as { response?: { status?: number } })?.response?.status;
  return s === 404 || s === 403;
}

export type LoadContextOptions = {
  /** Bypass in-memory group cache and refetch from API (e.g. after join). */
  force?: boolean;
};

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
  const [isGameChatArchived, setIsGameChatArchived] = useState(false);
  const [archivedGameMeta, setArchivedGameMeta] = useState<ArchivedGameChatMeta | null>(null);

  const userChatRef = useRef(userChat);
  const groupChannelRef = useRef(groupChannel);
  const archivedGameMetaRef = useRef(archivedGameMeta);
  const groupFetchSeqRef = useRef(0);
  userChatRef.current = userChat;
  groupChannelRef.current = groupChannel;
  archivedGameMetaRef.current = archivedGameMeta;

  const loadContext = useCallback(async (options?: LoadContextOptions) => {
    if (!id) {
      if (!isEmbedded) setIsLoadingContext(false);
      return null;
    }
    const requestId = id;
    try {
      if (contextType === 'GAME') {
        const response = await gamesApi.getById(id);
        if (currentIdRef.current !== requestId) return null;
        const archivedLocally = await hydrateThreadArchivedMemory('GAME', requestId);
        if (currentIdRef.current !== requestId) return null;
        const archiveState = resolveLoadedGameChatArchiveState(
          archivedLocally,
          archivedGameMetaRef.current
        );
        setIsGameChatArchived(archiveState.isGameChatArchived);
        setArchivedGameMeta(archiveState.archivedGameMeta);
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
        const force = options?.force === true;
        if (!force && groupChannelRef.current?.id === id) return groupChannelRef.current;
        if (
          !force &&
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
        const fetchSeq = ++groupFetchSeqRef.current;
        const response = await chatApi.getGroupChannelById(id);
        if (currentIdRef.current !== requestId || groupFetchSeqRef.current !== fetchSeq) return null;
        const merged = mergeGroupChannelFromApi(groupChannelRef.current, response.data);
        setGroupChannel(merged);
        setGroupChannelParticipantsCount(merged.participantsCount || 0);
        if (merged.bug) {
          setBug(merged.bug as Bug);
        }
        return merged;
      }
      return null;
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: unknown } };
      if (contextType === 'GAME' && err.response?.status === 410 && isCancelledGame410Payload(err.response.data)) {
        const payload = err.response.data;
        const stub = buildArchivedGameStub(requestId, payload);
        if (currentIdRef.current !== requestId) return null;
        setGame(stub);
        setIsGameChatArchived(true);
        setArchivedGameMeta(archivedMetaFrom410(payload));
        markThreadArchivedInMemory('GAME', requestId);
        await hydrateThreadArchivedMemory('GAME', requestId);
        return stub;
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
        } else if (contextType === 'GAME') {
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
          const mergedStub = mergeGroupChannelFromApi(groupChannelRef.current, stub);
          setGroupChannel(mergedStub);
          setGroupChannelParticipantsCount(mergedStub.participantsCount || 0);
          if (mergedStub.bug) {
            setBug(mergedStub.bug as Bug);
          }
          return mergedStub;
        }
      }
      if (currentIdRef.current === requestId && contextType === 'GAME') {
        const archivedLocally = await hydrateThreadArchivedMemory('GAME', requestId);
        if (archivedLocally) {
          setIsGameChatArchived(true);
          markThreadArchivedInMemory('GAME', requestId);
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
    if (!id || contextType !== 'GAME') return;
    let cancelled = false;
    void hydrateThreadArchivedMemory('GAME', id).then((archived) => {
      if (!cancelled && archived) setIsGameChatArchived(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, contextType]);

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
    isGameChatArchived,
    setIsGameChatArchived,
    archivedGameMeta,
    setArchivedGameMeta,
  };
}
