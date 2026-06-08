import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';

export function useChatListContactsMode(chatsFilter: ChatsFilterType) {
  const [, setSearchParams] = useSearchParams();
  const [contactsMode, setContactsMode] = useState(false);
  const [listTransition, setListTransition] = useState<'idle' | 'out' | 'in'>('idle');

  useEffect(() => {
    if (chatsFilter !== 'users') setContactsMode(false);
  }, [chatsFilter]);

  const handleContactsToggle = useCallback(
    (
      skipUrlSyncRef: React.MutableRefObject<boolean>,
      setSearchInput: (v: string) => void,
      fetchContactsData: () => Promise<void>
    ) => {
      if (contactsMode) {
        setListTransition('out');
        setTimeout(() => {
          setContactsMode(false);
          skipUrlSyncRef.current = true;
          setSearchInput('');
          setSearchParams((p) => {
            const next = new URLSearchParams(p);
            next.delete('q');
            return next;
          }, { replace: true });
          setListTransition('in');
          setTimeout(() => setListTransition('idle'), 300);
        }, 250);
      } else {
        setListTransition('out');
        setTimeout(() => {
          setContactsMode(true);
          void fetchContactsData();
          setListTransition('in');
          setTimeout(() => setListTransition('idle'), 300);
        }, 250);
      }
    },
    [contactsMode, setSearchParams]
  );

  return { contactsMode, listTransition, handleContactsToggle };
}

export function useChatListExpandableSections() {
  const [activeChatsExpanded, setActiveChatsExpanded] = useState(true);
  const [usersExpanded, setUsersExpanded] = useState(true);
  const [messagesExpanded, setMessagesExpanded] = useState(true);
  const [gamesExpanded, setGamesExpanded] = useState(true);
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [bugsExpanded, setBugsExpanded] = useState(true);
  const [marketListingsExpanded, setMarketListingsExpanded] = useState(true);
  return {
    activeChatsExpanded,
    setActiveChatsExpanded,
    usersExpanded,
    setUsersExpanded,
    messagesExpanded,
    setMessagesExpanded,
    gamesExpanded,
    setGamesExpanded,
    channelsExpanded,
    setChannelsExpanded,
    bugsExpanded,
    setBugsExpanded,
    marketListingsExpanded,
    setMarketListingsExpanded,
  };
}
