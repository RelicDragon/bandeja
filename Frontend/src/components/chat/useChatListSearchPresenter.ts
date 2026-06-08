import { useCallback, useMemo } from 'react';
import transliterate from '@sindresorhus/transliterate';
import { getChatTitle } from '@/utils/chatListSort';
import type { BasicUser } from '@/types';
import type { ChatItem } from './chatListTypes';
import type { ChatsFilterType } from './chatListFeedStore';
import type { ChatListSearchRow } from './chatListViewModel.types';

type SearchPresenterOpts = {
  chatsFilter: ChatsFilterType;
  debouncedSearchQuery: string;
  contactsMode: boolean;
  userId: string | undefined;
  activeChats: ChatItem[];
  cityUsers: BasicUser[];
  searchableUsersData: { activeChats: ChatItem[]; cityUsers: BasicUser[] } | null;
};

export function useChatListSearchPresenter(opts: SearchPresenterOpts) {
  const {
    chatsFilter,
    debouncedSearchQuery,
    contactsMode,
    userId,
    activeChats,
    cityUsers,
    searchableUsersData,
  } = opts;

  const normalizeString = useCallback((str: string) => transliterate(str).toLowerCase(), []);

  const matchesSearch = useCallback(
    (title: string) => {
      if (!debouncedSearchQuery.trim()) return true;
      return normalizeString(title).includes(normalizeString(debouncedSearchQuery));
    },
    [debouncedSearchQuery, normalizeString]
  );

  const filteredActiveChats = useMemo(() => {
    const source = chatsFilter === 'channels' ? (searchableUsersData?.activeChats ?? []) : activeChats;
    if (chatsFilter !== 'users' && chatsFilter !== 'channels') return [];
    if (!debouncedSearchQuery.trim()) return chatsFilter === 'users' ? activeChats : [];
    return source.filter((chat) => matchesSearch(getChatTitle(chat, userId || '')));
  }, [activeChats, searchableUsersData?.activeChats, debouncedSearchQuery, chatsFilter, userId, matchesSearch]);

  const filteredCityUsers = useMemo(() => {
    const source = chatsFilter === 'channels' ? (searchableUsersData?.cityUsers ?? []) : cityUsers;
    if (chatsFilter !== 'users' && chatsFilter !== 'channels') return [];
    if (!debouncedSearchQuery.trim()) return chatsFilter === 'users' ? cityUsers : [];
    return source.filter((u) => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      return matchesSearch(fullName);
    });
  }, [cityUsers, searchableUsersData?.cityUsers, debouncedSearchQuery, chatsFilter, matchesSearch]);

  const activeChatUserIds = useMemo(
    () =>
      new Set(
        filteredActiveChats
          .filter((c): c is Extract<ChatItem, { type: 'user' }> => c.type === 'user')
          .map((c) => (c.data.user1Id === userId ? c.data.user2Id : c.data.user1Id))
      ),
    [filteredActiveChats, userId]
  );

  const cityUserIds = useMemo(() => new Set(filteredCityUsers.map((u) => u.id)), [filteredCityUsers]);

  const filteredCityUsersExcludingActive = useMemo(
    () => filteredCityUsers.filter((u) => !activeChatUserIds.has(u.id)),
    [filteredCityUsers, activeChatUserIds]
  );

  const filteredActiveChatsExcludingUsers = useMemo(
    () =>
      filteredActiveChats.filter((c) => {
        if (c.type !== 'user') return true;
        const otherId = c.data.user1Id === userId ? c.data.user2Id : c.data.user1Id;
        return !cityUserIds.has(otherId);
      }),
    [filteredActiveChats, cityUserIds, userId]
  );

  const isSearchMode =
    debouncedSearchQuery.trim().length > 0 &&
    (chatsFilter === 'users' || chatsFilter === 'channels' || chatsFilter === 'bugs' || chatsFilter === 'market');

  const displayChats = useMemo((): ChatListSearchRow[] => {
    if (!isSearchMode) return [];
    const usersSection = { type: 'section' as const, label: 'users' as const };
    const activeSection = { type: 'section' as const, label: 'active' as const };
    const items: ChatListSearchRow[] = [];
    if (contactsMode) {
      if (filteredCityUsers.length > 0) {
        items.push(usersSection);
        filteredCityUsers.forEach((u) => items.push({ type: 'contact', user: u }));
      }
      if (filteredActiveChatsExcludingUsers.length > 0) {
        items.push(activeSection);
        filteredActiveChatsExcludingUsers.forEach((c) => items.push({ type: 'chat', data: c }));
      }
    } else {
      if (filteredActiveChats.length > 0) {
        items.push(activeSection);
        filteredActiveChats.forEach((c) => items.push({ type: 'chat', data: c }));
      }
      if (filteredCityUsersExcludingActive.length > 0) {
        items.push(usersSection);
        filteredCityUsersExcludingActive.forEach((u) => items.push({ type: 'contact', user: u }));
      }
    }
    return items;
  }, [
    isSearchMode,
    contactsMode,
    filteredActiveChats,
    filteredActiveChatsExcludingUsers,
    filteredCityUsers,
    filteredCityUsersExcludingActive,
  ]);

  return { isSearchMode, displayChats, matchesSearch };
}
