import { useState, useCallback, useEffect, type RefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { chatApi } from '@/api/chat';
import { gamesApi } from '@/api/games';
import { usePlayersStore } from '@/store/playersStore';
import type { ChatContextType, UserChat as UserChatType, GroupChannel } from '@/api/chat';
import type { Game, Bug } from '@/types';

export interface UseGameChatContextParams {
  id: string | undefined;
  contextType: ChatContextType;
  isEmbedded: boolean;
  initialUserChat: UserChatType | null | undefined;
  locationPathname: string;
  navigate: NavigateFunction;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  currentIdRef: RefObject<string | undefined>;
}

export function useGameChatContext({
  id,
  contextType,
  isEmbedded,
  initialUserChat,
  locationPathname,
  navigate,
  setChatsFilter,
  currentIdRef,
}: UseGameChatContextParams) {
  const [game, setGame] = useState<Game | null>(null);
  const [bug, setBug] = useState<Bug | null>(null);
  const [userChat, setUserChat] = useState<UserChatType | null>(initialUserChat ?? null);
  const [groupChannel, setGroupChannel] = useState<GroupChannel | null>(null);
  const [groupChannelParticipantsCount, setGroupChannelParticipantsCount] = useState<number>(0);
  const [isLoadingContext, setIsLoadingContext] = useState(!isEmbedded);

  const loadContext = useCallback(async () => {
    if (!id) return null;
    const requestId = id;
    try {
      if (contextType === 'GAME') {
        const response = await gamesApi.getById(id);
        if (currentIdRef.current !== requestId) return null;
        setGame(response.data);
        return response.data;
      }
      if (contextType === 'USER') {
        if (userChat?.id === id) return userChat;
        const { fetchUserChats, getChatById } = usePlayersStore.getState();
        await fetchUserChats();
        if (currentIdRef.current !== requestId) return null;
        const foundChat = getChatById(id);
        if (foundChat) setUserChat(foundChat);
        return foundChat;
      }
      if (contextType === 'GROUP') {
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
    } catch (error) {
      console.error('Failed to load context:', error);
      if (currentIdRef.current === requestId && !isEmbedded) {
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
      }
      return null;
    } finally {
      if (currentIdRef.current === requestId) setIsLoadingContext(false);
    }
  }, [id, contextType, navigate, userChat, isEmbedded, setChatsFilter, currentIdRef]);

  useEffect(() => {
    const hasChatInState = contextType === 'USER' && initialUserChat;
    if (!isEmbedded && !isLoadingContext && !game && !bug && !userChat && !groupChannel && !hasChatInState) {
      if (contextType === 'USER') {
        setChatsFilter('users');
        navigate('/chats', { replace: true });
      } else if (contextType === 'GROUP') {
        const isBugChat = locationPathname.match(/^\/bugs\/[^/]+$/);
        if (isBugChat) {
          setChatsFilter('bugs');
          navigate('/bugs', { replace: true });
        } else {
          setChatsFilter('channels');
          navigate('/chats', { replace: true });
        }
      } else if (contextType === 'GAME') {
        navigate('/', { replace: true });
      }
    }
  }, [isEmbedded, isLoadingContext, game, bug, userChat, groupChannel, contextType, navigate, setChatsFilter, locationPathname, initialUserChat]);

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
