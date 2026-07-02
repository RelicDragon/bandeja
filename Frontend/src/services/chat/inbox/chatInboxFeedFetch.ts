import { chatApi, GroupChannel } from '@/api/chat';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { sortChatItems } from '@/utils/chatListSort';
import {
  calculateLastMessageDate,
  deduplicateChats,
  groupsToChatItems,
  gamesToChatItems,
  channelsToChatItems,
  type FilterCache,
} from '@/utils/chatListHelpers';
import { loadGlobalInvitablePlayers } from '@/utils/loadGlobalInvitablePlayers';
import { usePlayersStore } from '@/store/playersStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { buildBugsApiFilterParams } from '@/components/bugs/bugsFilterParams';
import { useAuthStore } from '@/store/authStore';
import { ensureCityGroupInUsersChatItems } from '@/utils/chatListCityGroup';
import {
  prepareChatsForVisibleApply,
  shouldSkipRedundantNetworkVisibleApply,
} from './chatInboxFeedPrepare';
import { resolveGameUnreadCounts, resolveGroupUnreadCounts, userChatUnreadCount } from '@/utils/unreadCountsFromStore';
import { useUnreadStore } from '@/store/unreadStore';
import { useChatListFeedStore, type ChatsFilterType } from '@/components/chat/chatListFeedStore';
import type { ChatItem } from '@/components/chat/chatListTypes';
import type { BasicUser } from '@/types';
import type { ChatInboxAdapter } from './types';

export type ChatInboxFetchOptions = {
  /** When true, bugs list ignores status/type/created-by-me panel filters (unread-only mode). */
  ignoreBugsFilter?: boolean;
};

export type ChatInboxFetchDeps = {
  getMergedDrafts: (forceRefetch?: boolean) => Promise<import('@/api/chat').ChatDraft[]>;
  adapter: Pick<
    ChatInboxAdapter,
    'replaceThreadIndex' | 'commitFilterCache' | 'invalidateFilterCache' | 'upsertThreadIndex'
  >;
};

export function createChatInboxFetchOps(deps: ChatInboxFetchDeps) {
  const { getMergedDrafts, adapter } = deps;

  const fetchUsersSearchData = async (): Promise<{
    activeChats: ChatItem[];
    cityUsers: BasicUser[];
    usersHasMore: boolean;
  }> => {
    const user = useAuthStore.getState().user;
    if (!user) return { activeChats: [], cityUsers: [], usersHasMore: false };
    const { fetchUserChats } = usePlayersStore.getState();
    await fetchUserChats();
    const cityUsersData = await loadGlobalInvitablePlayers();
    const allDrafts = await getMergedDrafts();
    const { chats: userChats } = usePlayersStore.getState();
    const blockedUserIds = user.blockedUserIds || [];
    const activeChats: ChatItem[] = [];
    Object.values(userChats).forEach((chat) => {
      const otherUserId = chat.user1Id === user.id ? chat.user2Id : chat.user1Id;
      const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
      if (otherUserId && !blockedUserIds.includes(otherUserId)) {
        const draft = matchDraftToChat(allDrafts, 'USER', chat.id);
        const lastMessageDate =
          chat.lastMessage || draft ? calculateLastMessageDate(chat.lastMessage, draft, chat.updatedAt) : null;
        activeChats.push({
          type: 'user',
          data: chat,
          lastMessageDate,
          unreadCount: userChatUnreadCount(chat.id),
          otherUser,
          draft: draft || null,
        });
      }
    });
    try {
      const { data: groups, pagination } = await chatApi.getGroupChannels('users', 1);
      const groupList = (groups || []) as GroupChannel[];
      const groupIds = groupList.map((g: GroupChannel) => g.id);
      const groupUnreads = await resolveGroupUnreadCounts(groupIds);
      const groupChatItems = groupsToChatItems(groupList, groupUnreads, allDrafts, 'users', user?.id);
      activeChats.push(...groupChatItems);
      const games = await chatApi.getUserChatGames();
      const gameIds = games.map((g) => g.id);
      const gameUnreads = await resolveGameUnreadCounts(gameIds);
      activeChats.push(...gamesToChatItems(games, gameUnreads, allDrafts));
      const withCity = await ensureCityGroupInUsersChatItems(
        deduplicateChats(sortChatItems(activeChats, 'users', user?.id)),
        user.id,
        { allDrafts }
      );
      const cityUsersArray = Array.isArray(cityUsersData) ? cityUsersData : [];
      return { activeChats: withCity, cityUsers: cityUsersArray, usersHasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchUsersSearchData failed:', err);
      const withCity = await ensureCityGroupInUsersChatItems(
        deduplicateChats(sortChatItems(activeChats, 'users', user?.id)),
        user.id,
        { allDrafts }
      );
      return {
        activeChats: withCity,
        cityUsers: Array.isArray(cityUsersData) ? cityUsersData : [],
        usersHasMore: false,
      };
    }
  };

  const fetchUsersGroups = async (page: number): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    const user = useAuthStore.getState().user;
    if (!user) return { chats: [], hasMore: false };
    try {
      const allDrafts = await getMergedDrafts();
      const { data: groups, pagination } = await chatApi.getGroupChannels('users', page);
      const groupList = (groups || []) as GroupChannel[];
      const groupIds = groupList.map((g: GroupChannel) => g.id);
      const groupUnreads = await resolveGroupUnreadCounts(groupIds);
      const chatItems = groupsToChatItems(groupList, groupUnreads, allDrafts, 'users', user?.id);
      return { chats: chatItems, hasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchUsersGroups failed:', err);
      return { chats: [], hasMore: false };
    }
  };

  const fetchBugs = async (
    page = 1,
    fetchOptions?: ChatInboxFetchOptions
  ): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    const user = useAuthStore.getState().user;
    if (!user) return { chats: [], hasMore: false };
    try {
      const filterParams = fetchOptions?.ignoreBugsFilter
        ? undefined
        : buildBugsApiFilterParams(useGameDetailsChromeStore.getState().bugsFilter);
      const [channelsRes, allDrafts] = await Promise.all([
        chatApi.getGroupChannels('bugs', page, filterParams),
        getMergedDrafts(),
      ]);
      const channelList = (channelsRes.data || []) as GroupChannel[];
      useUnreadStore.getState().registerBugChannels(channelList);
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'bugs', {
        useUpdatedAtFallback: true,
        filterByIsGroup: true,
        allDrafts,
      });
      return { chats: chatItems, hasMore: channelsRes.pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchBugs failed:', err);
      return { chats: [], hasMore: false };
    }
  };

  const fetchChannels = async (page = 1): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    const user = useAuthStore.getState().user;
    if (!user) return { chats: [], hasMore: false };
    try {
      const [channelsRes, allDrafts] = await Promise.all([
        chatApi.getGroupChannels('channels', page),
        getMergedDrafts(),
      ]);
      const channelList = (channelsRes.data || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'channels', {
        filterByIsChannel: true,
        allDrafts,
      });
      return { chats: chatItems, hasMore: channelsRes.pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchChannels failed:', err);
      return { chats: [], hasMore: false };
    }
  };

  const fetchMarket = async (page = 1): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    const user = useAuthStore.getState().user;
    if (!user) return { chats: [], hasMore: false };
    try {
      const [channelsRes, allDrafts] = await Promise.all([
        chatApi.getGroupChannels('market', page),
        getMergedDrafts(),
      ]);
      const channelList = (channelsRes.data || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'market', {
        filterByIsGroup: true,
        useUpdatedAtFallback: true,
        allDrafts,
      });
      return { chats: chatItems, hasMore: channelsRes.pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchMarket failed:', err);
      return { chats: [], hasMore: false };
    }
  };

  const fetchFilter = async (filter: ChatsFilterType, fetchOptions?: ChatInboxFetchOptions) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const bugsFilterParams = fetchOptions?.ignoreBugsFilter
      ? undefined
      : buildBugsApiFilterParams(useGameDetailsChromeStore.getState().bugsFilter);

    if (filter === 'users') {
      const playersStore = usePlayersStore.getState();
      await playersStore.fetchUserChats();
      const cityUsersData = await loadGlobalInvitablePlayers();
      const allDrafts = await getMergedDrafts();
      const [usersGroupsRes, games] = await Promise.all([
        chatApi.getGroupChannels('users', 1),
        chatApi.getUserChatGames(),
      ]);
      const usersGroupList = (usersGroupsRes.data || []) as GroupChannel[];
      const groupIds = usersGroupList.map((g: GroupChannel) => g.id);
      const gameIds = games.map((g) => g.id);
      const [groupUnreads, gameUnreads] = await Promise.all([
        resolveGroupUnreadCounts(groupIds),
        resolveGameUnreadCounts(gameIds),
      ]);
      const { chats: userChats } = usePlayersStore.getState();
      const blockedUserIds = user.blockedUserIds || [];
      const activeChats: ChatItem[] = [];
      Object.values(userChats).forEach((chat) => {
        const otherUserId = chat.user1Id === user.id ? chat.user2Id : chat.user1Id;
        const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
        if (otherUserId && !blockedUserIds.includes(otherUserId)) {
          const draft = matchDraftToChat(allDrafts, 'USER', chat.id);
          const lastMessageDate =
            chat.lastMessage || draft ? calculateLastMessageDate(chat.lastMessage, draft, chat.updatedAt) : null;
          activeChats.push({
            type: 'user',
            data: chat,
            lastMessageDate,
            unreadCount: userChatUnreadCount(chat.id),
            otherUser,
            draft: draft || null,
          });
        }
      });
      const usersGroupItems = groupsToChatItems(usersGroupList, groupUnreads, allDrafts, 'users', user?.id);
      activeChats.push(...usersGroupItems);
      activeChats.push(...gamesToChatItems(games, gameUnreads, allDrafts));
      const usersChatItems = await ensureCityGroupInUsersChatItems(
        deduplicateChats(sortChatItems(activeChats, 'users', user?.id)),
        user.id,
        { allDrafts }
      );
      const cityUsersArray = Array.isArray(cityUsersData) ? cityUsersData : [];
      const cacheEntry: FilterCache = {
        chats: usersChatItems,
        cityUsers: cityUsersArray,
        usersHasMore: usersGroupsRes.pagination?.hasMore ?? false,
      };
      adapter.commitFilterCache('users', cacheEntry, { userId: user.id, applyToVisible: false });
      useChatListFeedStore.getState().setLastFetchTime(Date.now());
      adapter.replaceThreadIndex('users', usersChatItems);
      return;
    }

    const allDrafts = await getMergedDrafts();
    if (filter === 'bugs') {
      const bugsRes = await chatApi.getGroupChannels('bugs', 1, bugsFilterParams);
      const channelList = (bugsRes.data || []) as GroupChannel[];
      useUnreadStore.getState().registerBugChannels(channelList);
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const bugsChatItems = channelsToChatItems(channelList, channelUnreads, 'bugs', {
        useUpdatedAtFallback: true,
        filterByIsGroup: true,
        allDrafts,
      });
      const cacheEntry: FilterCache = {
        chats: deduplicateChats(bugsChatItems),
        bugsHasMore: bugsRes.pagination?.hasMore ?? false,
      };
      adapter.commitFilterCache('bugs', cacheEntry, { userId: user.id, applyToVisible: false });
      useChatListFeedStore.getState().setLastFetchTime(Date.now());
      adapter.replaceThreadIndex('bugs', cacheEntry.chats);
      return;
    }
    if (filter === 'channels') {
      const channelsRes = await chatApi.getGroupChannels('channels', 1);
      const channelList = (channelsRes.data || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const channelsChatItems = channelsToChatItems(channelList, channelUnreads, 'channels', {
        filterByIsChannel: true,
        allDrafts,
      });
      const cacheEntry: FilterCache = {
        chats: deduplicateChats(channelsChatItems),
        channelsHasMore: channelsRes.pagination?.hasMore ?? false,
      };
      adapter.commitFilterCache('channels', cacheEntry, { userId: user.id, applyToVisible: false });
      useChatListFeedStore.getState().setLastFetchTime(Date.now());
      adapter.replaceThreadIndex('channels', cacheEntry.chats);
      return;
    }
    if (filter === 'market') {
      const marketRes = await chatApi.getGroupChannels('market', 1);
      const channelList = (marketRes.data || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const marketChatItems = channelsToChatItems(channelList, channelUnreads, 'market', {
        filterByIsGroup: true,
        useUpdatedAtFallback: true,
        allDrafts,
      });
      const cacheEntry: FilterCache = {
        chats: deduplicateChats(marketChatItems),
        marketHasMore: marketRes.pagination?.hasMore ?? false,
      };
      adapter.commitFilterCache('market', cacheEntry, { userId: user.id, applyToVisible: false });
      useChatListFeedStore.getState().setLastFetchTime(Date.now());
      adapter.replaceThreadIndex('market', cacheEntry.chats);
    }
  };

  const runCoalescedFilterFetch = async (filter: ChatsFilterType, fetchOptions?: ChatInboxFetchOptions) => {
    if (fetchOptions?.ignoreBugsFilter) {
      await fetchFilter(filter, fetchOptions);
      return;
    }
    const store = useChatListFeedStore.getState();
    let p = store.getInFlight(filter);
    if (!p) {
      p = (async () => {
        try {
          await fetchFilter(filter);
        } finally {
          useChatListFeedStore.getState().clearInFlight(filter);
        }
      })();
      store.registerInFlight(filter, p);
    }
    await p;
  };

  const fetchChatsForFilter = async (filterArg?: ChatsFilterType, fetchOptions?: ChatInboxFetchOptions) => {
    const filter = filterArg ?? useShellNavStore.getState().chatsFilter;
    if (filter !== 'users' && filter !== 'bugs' && filter !== 'channels' && filter !== 'market') return;
    try {
      await runCoalescedFilterFetch(filter, fetchOptions);
    } catch (err) {
      console.error('fetchChatsForFilter failed:', err);
      return;
    }
    if (filter !== useShellNavStore.getState().chatsFilter) return;
    const cached = useChatListFeedStore.getState().getFilterCache(filter);
    if (!cached) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;
    const allDrafts = await getMergedDrafts(true);
    const prepared = await prepareChatsForVisibleApply(cached.chats, filter, userId, allDrafts, false);
    const visible = useChatListFeedStore.getState().rows;
    if (shouldSkipRedundantNetworkVisibleApply(visible, prepared, filter)) {
      useChatListFeedStore.getState().markNetworkSettled(filter);
      return;
    }
    adapter.commitFilterCache(
      filter,
      { ...cached, chats: prepared },
      { userId, applyToVisible: true }
    );
    useChatListFeedStore.getState().markNetworkSettled(filter);
  };

  const runFeedLoadMore = async (
    filter: ChatsFilterType,
    isActive: boolean,
    loadingMore: boolean,
    hasMore: boolean,
    fetcher: (page: number) => Promise<{ chats: ChatItem[]; hasMore: boolean }>
  ) => {
    if (!isActive || loadingMore || !hasMore) return;
    const store = useChatListFeedStore.getState();
    store.setPagination(filter, { loadingMore: true });
    try {
      const nextPage = store.pagination[filter].page + 1;
      const { chats: moreChats, hasMore: nextHasMore } = await fetcher(nextPage);
      store.mergeLoadMoreRows(filter, moreChats, nextHasMore);
      adapter.upsertThreadIndex(filter, moreChats);
    } finally {
      useChatListFeedStore.getState().setPagination(filter, { loadingMore: false });
    }
  };

  return {
    fetchUsersSearchData,
    fetchUsersGroups,
    fetchBugs,
    fetchChannels,
    fetchMarket,
    fetchFilter,
    runCoalescedFilterFetch,
    fetchChatsForFilter,
    runFeedLoadMore,
  };
}

export type ChatInboxFetchOps = ReturnType<typeof createChatInboxFetchOps>;
