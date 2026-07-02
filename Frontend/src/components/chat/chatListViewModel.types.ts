import type { TFunction } from 'i18next';
import type { MarketItem, BasicUser, User } from '@/types';
import type { ChatSelectNavOptions, ChatType } from './chatListTypes';
import type { ChatItem } from './chatListTypes';
import type { ChatsFilterType } from './chatListFeedStore';

export type ChatListPullRefreshModel = {
  isRefreshing: boolean;
  pullDistance: number;
  pullProgress: number;
};

export type ChatListFeedModel = {
  loading: boolean;
  chatsFilter: ChatsFilterType;
  displayedChats: ChatItem[];
  chats: ChatItem[];
  bugsHasMore: boolean;
  usersHasMore: boolean;
  channelsHasMore: boolean;
  marketHasMore: boolean;
  bugsLoadingMore: boolean;
  usersLoadingMore: boolean;
  channelsLoadingMore: boolean;
  marketLoadingMore: boolean;
  loadMoreSentinelRef: React.RefObject<HTMLDivElement | null>;
  listBodyScrollRef: React.RefObject<HTMLDivElement | null>;
  showChatsEmpty: boolean;
  pinnedCountUsers: number;
  getChatKey: (item: ChatItem) => string;
};

export type ChatListSearchModel = {
  searchInput: string;
  setSearchInput: (v: string) => void;
  debouncedSearchQuery: string;
  isSearchMode: boolean;
  displayChats: ChatListSearchRow[];
  contactsMode: boolean;
  cityUsersLoading: boolean;
  showContactsEmpty: boolean;
  unreadChatsCount: number;
  unreadFilterActive: boolean;
  toggleUnreadFilter: () => void;
  skipUrlSyncRef: React.MutableRefObject<boolean>;
  setSearchParams: ReturnType<typeof import('react-router-dom').useSearchParams>[1];
};

export type ChatListSearchRow =
  | { type: 'section'; label: 'users' | 'active' }
  | { type: 'chat'; data: ChatItem }
  | { type: 'contact'; user: BasicUser };

export type ChatListMarketModel = {
  marketChatRole: 'buyer' | 'seller';
  setMarketChatRole: (role: 'buyer' | 'seller') => void;
  marketBuyerSellerUnread: { buyer: number; seller: number };
  marketGroupedByItem: Array<{
    itemId: string;
    title: string;
    thumb?: string;
    marketItem?: MarketItem;
    channels: ChatItem[];
  }> | null;
  selectedMarketItemForDrawer: MarketItem | null;
  closeMarketItemDrawer: () => void;
  handleMarketItemGroupClick: (group: { itemId: string; marketItem?: MarketItem }) => void;
  handleCreateListing: () => void;
};

export type ChatListContactsModel = {
  contactSections: {
    following: BasicUser[];
    followers: BasicUser[];
    other: BasicUser[];
  };
  handleContactsToggle: () => void;
  handleContactClick: (userId: string) => void;
  listTransition: 'idle' | 'out' | 'in';
};

export type ChatListExpandableSectionsModel = {
  activeChatsExpanded: boolean;
  setActiveChatsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  usersExpanded: boolean;
  setUsersExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  messagesExpanded: boolean;
  setMessagesExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  gamesExpanded: boolean;
  setGamesExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  channelsExpanded: boolean;
  setChannelsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  bugsExpanded: boolean;
  setBugsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  marketListingsExpanded: boolean;
  setMarketListingsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
};

export type ChatListActionsModel = {
  handleChatClick: (chatId: string, chatType: ChatType, options?: ChatSelectNavOptions) => void;
  handlePinUserChat: (chatId: string, isPinned: boolean) => Promise<void>;
  handlePinGroupChannel: (channelId: string, isPinned: boolean) => Promise<void>;
  handleMuteUserChat: (chatId: string, isMuted: boolean) => Promise<void>;
  handleMuteGroupChannel: (channelId: string, isMuted: boolean) => Promise<void>;
  pinningId: string | null;
  mutedChats: Record<string, boolean>;
  togglingMuteId: string | null;
};

export type ChatListModalsModel = {
  showBugModal: boolean;
  setShowBugModal: (v: boolean) => void;
  handleBugCreated: (groupChannelId?: string) => void;
  bugsFilterPanelOpen: boolean;
  setBugsFilterPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export type ChatListSelectionModel = {
  selectedChatId: string | null | undefined;
  selectedChatType: ChatType | null | undefined;
};

export type ChatListViewModel = {
  t: TFunction;
  isDesktop: boolean;
  user: User | null;
  feed: ChatListFeedModel;
  pullRefresh: ChatListPullRefreshModel;
  search: ChatListSearchModel;
  market: ChatListMarketModel;
  contacts: ChatListContactsModel;
  sections: ChatListExpandableSectionsModel;
  actions: ChatListActionsModel;
  modals: ChatListModalsModel;
  selection: ChatListSelectionModel;
};
