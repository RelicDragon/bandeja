import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import transliterate from '@sindresorhus/transliterate';
import { UserChatCard } from './UserChatCard';
import { BugCard } from '@/components/bugs/BugCard';
import { GroupChannelCard } from './GroupChannelCard';
import { chatApi, UserChat, GroupChannel, ChatDraft } from '@/api/chat';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { bugsApi } from '@/api/bugs';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useNavigationStore } from '@/store/navigationStore';
import { Bug, BasicUser } from '@/types';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { MessageCircle, Search, X } from 'lucide-react';
import { ChatMessage } from '@/api/chat';
import { useSocketEventsStore } from '@/store/socketEventsStore';

type ChatItem =
  | { type: 'user'; data: UserChat; lastMessageDate: Date | null; unreadCount: number; otherUser?: BasicUser; draft?: ChatDraft | null }
  | { type: 'contact'; userId: string; user: BasicUser; interactionCount: number; isFavorite: boolean; lastMessageDate: null }

  
  | { type: 'bug'; data: Bug; lastMessageDate: Date; unreadCount: number }
  | { type: 'group'; data: GroupChannel; lastMessageDate: Date | null; unreadCount: number; draft?: ChatDraft | null }
  | { type: 'channel'; data: GroupChannel; lastMessageDate: Date | null; unreadCount: number };

export type ChatType = 'user' | 'bug' | 'group' | 'channel';

interface ChatListProps {
  onChatSelect?: (chatId: string, chatType: ChatType) => void;
  isDesktop?: boolean;
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
}

const calculateLastMessageDate = (
  lastMessage: ChatMessage | null | undefined,
  draft: ChatDraft | null | undefined,
  updatedAt: string
): Date => {
  const lastMessageTime = lastMessage 
    ? new Date(lastMessage.createdAt).getTime()
    : 0;
  const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
  const updatedTime = new Date(updatedAt).getTime();
  return new Date(Math.max(lastMessageTime, draftTime, updatedTime));
};

const fetchUnreadCounts = async (
  ids: string[],
  fetchFn: (id: string) => Promise<{ data: { count: number } }>
): Promise<Record<string, number>> => {
  const unreads: Record<string, number> = {};
  if (ids.length > 0) {
    await Promise.all(ids.map(async (id) => {
      try {
        const unread = await fetchFn(id);
        unreads[id] = unread.data.count || 0;
      } catch {
        unreads[id] = 0;
      }
    }));
  }
  return unreads;
};

export const ChatList = ({ onChatSelect, isDesktop = false, selectedChatId, selectedChatType }: ChatListProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { chatsFilter } = useNavigationStore();
  const favoriteUserIds = useFavoritesStore((state) => state.favoriteUserIds);
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const lastChatMessage = useSocketEventsStore((state) => state.lastChatMessage);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const liveUnreadCounts = usePlayersStore((state) => state.unreadCounts);
  const liveChats = usePlayersStore((state) => state.chats);

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
    }
  }, [user?.id, fetchFavorites]);

  const getChatTitle = (chat: ChatItem, currentUserId: string): string => {
    if (chat.type === 'user') {
      const otherUser = chat.data.user1Id === currentUserId ? chat.data.user2 : chat.data.user1;
      return `${otherUser?.firstName || ''} ${otherUser?.lastName || ''}`.trim() || 'Unknown';
    } else if (chat.type === 'contact') {
      return `${chat.user.firstName || ''} ${chat.user.lastName || ''}`.trim() || 'Unknown';
    } else if (chat.type === 'group' || chat.type === 'channel') {
      return chat.data.name || '';
    } else if (chat.type === 'bug') {
      return chat.data.text || chat.data.id;
    }
    return '';
  };

  const sortUserChatItems = useCallback((chatItems: ChatItem[]) => {
    if (!user?.id) return chatItems;
    
    return chatItems.sort((a, b) => {
      // Primary sort: by activity time (desc) - nulls at the end
      const aActivityTime = a.lastMessageDate ? a.lastMessageDate.getTime() : null;
      const bActivityTime = b.lastMessageDate ? b.lastMessageDate.getTime() : null;
      
      // Handle nulls - put them at the end
      if (aActivityTime === null && bActivityTime === null) {
        // Both null - sort by title
        const aTitle = getChatTitle(a, user.id).toLowerCase();
        const bTitle = getChatTitle(b, user.id).toLowerCase();
        return aTitle.localeCompare(bTitle);
      }
      if (aActivityTime === null) return 1; // a goes to end
      if (bActivityTime === null) return -1; // b goes to end
      
      // Both have activity time - sort desc
      if (bActivityTime !== aActivityTime) {
        return bActivityTime - aActivityTime;
      }
      
      // Secondary sort: by title (ascending)
      const aTitle = getChatTitle(a, user.id).toLowerCase();
      const bTitle = getChatTitle(b, user.id).toLowerCase();
      return aTitle.localeCompare(bTitle);
    });
  }, [user?.id]);

  const fetchChatsForFilter = useCallback(async (filter: 'users' | 'bugs' | 'channels') => {
    if (!user) return;

    try {
      setLoading(true);
      const chatItems: ChatItem[] = [];

      if (filter === 'users') {
        const { fetchPlayers, fetchUserChats } = usePlayersStore.getState();
        await Promise.all([fetchPlayers(), fetchUserChats()]);
        
        const draftsResponse = await chatApi.getUserDrafts(1, 100).catch(() => ({ drafts: [] }));
        const allDrafts = draftsResponse.drafts || [];
        
        const { users, chats: userChats, getUserMetadata, unreadCounts } = usePlayersStore.getState();

        const blockedUserIds = user.blockedUserIds || [];
        const processedUserIds = new Set<string>();

        Object.values(userChats).forEach(chat => {
          const otherUserId = chat.user1Id === user.id ? chat.user2Id : chat.user1Id;
          const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
          
          if (otherUserId && !blockedUserIds.includes(otherUserId)) {
            processedUserIds.add(otherUserId);
            const draft = matchDraftToChat(allDrafts, 'USER', chat.id);
            
            // Only set activity time if there's a message or draft
            const lastMessageDate = (chat.lastMessage || draft)
              ? calculateLastMessageDate(chat.lastMessage, draft, chat.updatedAt)
              : null;
            
            chatItems.push({
              type: 'user',
              data: chat,
              lastMessageDate,
              unreadCount: unreadCounts[chat.id] || 0,
              otherUser,
              draft: draft || null
            });
          }
        });

        // Add groups to users tab (integrated like Telegram)
        try {
          const groupsResponse = await chatApi.getGroupChannels();
          const groups = groupsResponse.data || [];
          const groupIds = groups.map(g => g.id);
          const groupUnreads = await fetchUnreadCounts(
            groupIds,
            (id) => chatApi.getGroupChannelUnreadCount(id)
          );

          groups.forEach(group => {
            if (!group.isChannel && (group.isParticipant || group.isOwner)) {
              const draft = matchDraftToChat(allDrafts, 'GROUP', group.id);
              // Only set activity time if there's a message or draft
              const lastMessageDate = (group.lastMessage || draft)
                ? calculateLastMessageDate(group.lastMessage, draft, group.updatedAt)
                : null;
              
              chatItems.push({
                type: 'group',
                data: group,
                lastMessageDate,
                unreadCount: groupUnreads[group.id] || 0,
                draft: draft || null
              });
            }
          });
        } catch (error) {
          console.error('Failed to fetch groups:', error);
        }

        Object.values(users).forEach((userData) => {
          const userId = userData.id;
          if (processedUserIds.has(userId) || userId === user.id || blockedUserIds.includes(userId)) return;

          const metadata = getUserMetadata(userId);
          
          chatItems.push({
            type: 'contact',
            userId,
            user: userData,
            interactionCount: metadata?.interactionCount || 0,
            isFavorite: favoriteUserIds.includes(userId),
            lastMessageDate: null
          });
        });

        // Sort entire list (user chats + groups + contacts) by activity time only
        sortUserChatItems(chatItems);
      } else if (filter === 'bugs') {
        const bugsResponse = await bugsApi.getBugs({ myBugsOnly: false });
        const bugs = bugsResponse.data.bugs || [];
        const bugIds = bugs.map(b => b.id);
        
        const bugUnreads = bugIds.length > 0
          ? await chatApi.getBugsUnreadCounts(bugIds)
          : { data: {} as Record<string, number> };

        bugs.forEach(bug => {
          chatItems.push({
            type: 'bug',
            data: bug,
            lastMessageDate: new Date(bug.updatedAt),
            unreadCount: bugUnreads.data[bug.id] || 0
          });
        });
      } else if (filter === 'channels') {
        try {
          const channelsResponse = await chatApi.getGroupChannels();
          const channels = channelsResponse.data || [];
          const channelIds = channels.map(c => c.id);
          const channelUnreads = await fetchUnreadCounts(
            channelIds,
            (id) => chatApi.getGroupChannelUnreadCount(id)
          );

          channels.forEach(channel => {
            if (channel.isChannel) {
              // Only set activity time if there's a message
              const lastMessageDate = channel.lastMessage
                ? new Date(channel.lastMessage.createdAt)
                : null;
              
              chatItems.push({
                type: 'channel',
                data: channel,
                lastMessageDate,
                unreadCount: channelUnreads[channel.id] || 0
              });
            }
          });
        } catch (error) {
          console.error('Failed to fetch channels:', error);
        }
      }

      if (filter !== 'users') {
        // For bugs and channels, sort by activity (draft or last message)
        chatItems.sort((a, b) => {
          // Primary sort: by activity time (desc) - nulls at the end
          const aTime = a.lastMessageDate ? a.lastMessageDate.getTime() : null;
          const bTime = b.lastMessageDate ? b.lastMessageDate.getTime() : null;
          
          // Handle nulls - put them at the end
          if (aTime === null && bTime === null) return 0;
          if (aTime === null) return 1; // a goes to end
          if (bTime === null) return -1; // b goes to end
          
          if (bTime !== aTime) {
            return bTime - aTime;
          }
          
          // Secondary: unread count (only for items that have unreadCount)
          if ((a.type === 'user' || a.type === 'group' || a.type === 'channel' || a.type === 'bug') && 
              (b.type === 'user' || b.type === 'group' || b.type === 'channel' || b.type === 'bug')) {
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
            if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
          }
          
          // Tertiary: by name/ID
          if (a.type === 'bug' && b.type === 'bug') {
            return a.data.id.localeCompare(b.data.id);
          }
          if (a.type === 'channel' && b.type === 'channel') {
            return a.data.name.localeCompare(b.data.name);
          }
          
          return 0;
        });
      }
      
      setChats(chatItems);
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      setLoading(false);
    }
  }, [user, favoriteUserIds, sortUserChatItems]);

  useEffect(() => {
    if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels') {
      fetchChatsForFilter(chatsFilter);
    }
  }, [fetchChatsForFilter, chatsFilter]);

  useEffect(() => {
    if (chatsFilter !== 'users') {
      setSearchQuery('');
    }
  }, [chatsFilter]);

  const updateChatDraft = useCallback((
    prevChats: ChatItem[],
    chatContextType: string,
    contextId: string,
    draft: ChatDraft | null
  ): ChatItem[] => {
    const updatedChats = prevChats.map((chat) => {
      if (chat.type === 'user' && chatContextType === 'USER' && chat.data.id === contextId) {
        const lastMessageDate = (chat.data.lastMessage || draft)
          ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
          : null;
        return {
          ...chat,
          draft,
          lastMessageDate
        };
      } else if (chat.type === 'group' && chatContextType === 'GROUP' && chat.data.id === contextId) {
        const lastMessageDate = (chat.data.lastMessage || draft)
          ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
          : null;
        return {
          ...chat,
          draft,
          lastMessageDate
        };
      }
      return chat;
    });
    
    if (chatsFilter === 'users') {
      return sortUserChatItems(updatedChats);
    }
    
    return updatedChats;
  }, [chatsFilter, sortUserChatItems]);

  const updateChatMessage = useCallback((
    prevChats: ChatItem[],
    chatContextType: string,
    contextId: string,
    message: ChatMessage
  ): ChatItem[] => {
    const { chats: storeChats, unreadCounts } = usePlayersStore.getState();
    const updatedChats = prevChats.map((chat) => {
      if (chat.type === 'user' && chatContextType === 'USER' && chat.data.id === contextId) {
        const updatedChat = storeChats[contextId] || chat.data;
        const draft = chat.draft || null;
        const lastMessageDate = ((updatedChat.lastMessage || message) || draft)
          ? calculateLastMessageDate(updatedChat.lastMessage || message, draft, updatedChat.updatedAt)
          : null;
        return {
          ...chat,
          data: updatedChat,
          unreadCount: unreadCounts[contextId] || chat.unreadCount || 0,
          lastMessageDate
        };
      } else if ((chat.type === 'group' || chat.type === 'channel') && chatContextType === 'GROUP' && chat.data.id === contextId) {
        const draft = chat.type === 'group' ? (chat.draft || null) : null;
        const lastMessageDate = (message || draft)
          ? calculateLastMessageDate(message, draft, new Date().toISOString())
          : null;
        return {
          ...chat,
          data: {
            ...chat.data,
            lastMessage: message,
            updatedAt: new Date().toISOString()
          },
          lastMessageDate
        };
      } else if (chat.type === 'bug' && chatContextType === 'BUG' && chat.data.id === contextId) {
        return {
          ...chat,
          data: {
            ...chat.data,
            updatedAt: new Date().toISOString()
          },
          lastMessageDate: new Date(message.createdAt)
        };
      }
      return chat;
    });
    
    if (chatsFilter === 'users') {
      return sortUserChatItems(updatedChats);
    } else if (chatsFilter === 'bugs' || chatsFilter === 'channels') {
      updatedChats.sort((a, b) => {
        // Primary sort: by activity time (desc) - nulls at the end
        const aTime = a.lastMessageDate ? a.lastMessageDate.getTime() : null;
        const bTime = b.lastMessageDate ? b.lastMessageDate.getTime() : null;
        
        // Handle nulls - put them at the end
        if (aTime === null && bTime === null) return 0;
        if (aTime === null) return 1; // a goes to end
        if (bTime === null) return -1; // b goes to end
        
        if (bTime !== aTime) {
          return bTime - aTime;
        }
        // Secondary: unread count (only for items that have unreadCount)
        if ((a.type === 'user' || a.type === 'group' || a.type === 'channel' || a.type === 'bug') && 
            (b.type === 'user' || b.type === 'group' || b.type === 'channel' || b.type === 'bug')) {
          if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
          if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
        }
        if (a.type === 'bug' && b.type === 'bug') {
          return a.data.id.localeCompare(b.data.id);
        }
        if (a.type === 'channel' && b.type === 'channel') {
          return a.data.name.localeCompare(b.data.name);
        }
        return 0;
      });
    }
    
    return updatedChats;
  }, [chatsFilter, sortUserChatItems]);

  useEffect(() => {
    const handleRefresh = () => {
      if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels') {
        fetchChatsForFilter(chatsFilter);
      }
    };

    const handleDraftUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        draft: ChatDraft;
        chatContextType: string;
        contextId: string;
      }>;
      const { draft, chatContextType, contextId } = customEvent.detail;

      setChats((prevChats) => updateChatDraft(prevChats, chatContextType, contextId, draft));
    };

    const handleDraftDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{
        chatContextType: string;
        contextId: string;
      }>;
      const { chatContextType, contextId } = customEvent.detail;

      setChats((prevChats) => updateChatDraft(prevChats, chatContextType, contextId, null));
    };

    window.addEventListener('refresh-chat-list', handleRefresh);
    window.addEventListener('draft-updated', handleDraftUpdate);
    window.addEventListener('draft-deleted', handleDraftDelete);
    
    return () => {
      window.removeEventListener('refresh-chat-list', handleRefresh);
      window.removeEventListener('draft-updated', handleDraftUpdate);
      window.removeEventListener('draft-deleted', handleDraftDelete);
    };
  }, [fetchChatsForFilter, chatsFilter, updateChatDraft, updateChatMessage]);

  useEffect(() => {
    if (!lastChatMessage) return;
    
    const handleNewMessage = (data: { contextType: string; contextId: string; message: any }) => {
      const { contextType, contextId, message } = data;
      
      const shouldUpdate = 
        (chatsFilter === 'users' && (contextType === 'USER' || contextType === 'GROUP')) ||
        (chatsFilter === 'bugs' && contextType === 'BUG') ||
        (chatsFilter === 'channels' && contextType === 'GROUP');
      
      if (shouldUpdate) {
        setChats((prevChats) => {
          const chatExists = prevChats.some((chat) => {
            if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return true;
            if (contextType === 'GROUP' && (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId) {
              if (chatsFilter === 'channels') return chat.type === 'channel';
              if (chatsFilter === 'users') return chat.type === 'group';
              return true;
            }
            if (contextType === 'BUG' && chat.type === 'bug' && chat.data.id === contextId) return true;
            return false;
          });
          
          if (chatExists) {
            return updateChatMessage(prevChats, contextType, contextId, message);
          }
          
          return prevChats;
        });
      }
    };
    
    handleNewMessage(lastChatMessage);
  }, [lastChatMessage, chatsFilter, updateChatMessage]);

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels') {
      await fetchChatsForFilter(chatsFilter);
    }
  }, [fetchChatsForFilter, chatsFilter]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading || isDesktop,
  });

  const handleChatClick = (chatId: string, chatType: ChatType) => {
    if (onChatSelect) {
      onChatSelect(chatId, chatType);
    }
  };

  const handleContactClick = async (userId: string) => {
    if (!user) return;
    
    try {
      const response = await chatApi.getOrCreateChatWithUser(userId);
      const chat = response.data;
      
      const { addChat } = usePlayersStore.getState();
      await addChat(chat);
      
      const updatedUnreadCounts = usePlayersStore.getState().unreadCounts;
      const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
      
      if (chatsFilter === 'users' && otherUser) {
        setChats((prevChats) => {
          const filteredChats = prevChats.filter(
            (item) => !(item.type === 'contact' && item.userId === userId)
          );
          
          // Only set activity time if there's a message
          const lastMessageDate = chat.lastMessage
            ? new Date(chat.lastMessage.createdAt)
            : null;
          
          const newChatItem: ChatItem = {
            type: 'user',
            data: chat,
            lastMessageDate,
            unreadCount: updatedUnreadCounts[chat.id] || 0,
            otherUser,
          };
          
          const updatedChats = [...filteredChats, newChatItem];
          sortUserChatItems(updatedChats);
          return updatedChats;
        });
      }
      
      if (onChatSelect) {
        onChatSelect(chat.id, 'user');
      }
    } catch (error) {
      console.error('Failed to create/get chat with user:', error);
    }
  };

  const normalizeString = (str: string) => {
    return transliterate(str).toLowerCase();
  };

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim() || chatsFilter !== 'users') {
      return chats;
    }

    const normalized = normalizeString(searchQuery);

    return chats.filter((chat) => {
      if (chat.type === 'user') {
        const otherUser = chat.data.user1Id === user?.id ? chat.data.user2 : chat.data.user1;
        const fullName = `${otherUser?.firstName || ''} ${otherUser?.lastName || ''}`.trim();
        return normalizeString(fullName).includes(normalized);
      } else if (chat.type === 'contact') {
        const fullName = `${chat.user.firstName || ''} ${chat.user.lastName || ''}`.trim();
        return normalizeString(fullName).includes(normalized);
      } else if (chat.type === 'group' || chat.type === 'channel') {
        return normalizeString(chat.data.name || '').includes(normalized);
      }
      return true;
    });
  }, [chats, searchQuery, chatsFilter, user?.id]);

  if (loading) {
    return (
      <>
        {!isDesktop && (
          <RefreshIndicator
            isRefreshing={isRefreshing}
            pullDistance={pullDistance}
            pullProgress={pullProgress}
          />
        )}
        <div
          className={isDesktop ? '' : 'space-y-0'}
          style={{
            transform: isDesktop ? 'none' : `translateY(${pullDistance}px)`,
            transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (chats.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-500 dark:text-gray-400">
        <MessageCircle size={64} className="mb-4 opacity-50" />
        <p className="text-lg font-medium">
          {t('chat.noConversations', { defaultValue: 'No conversations yet' })}
        </p>
        <p className="text-sm mt-2">
          {chatsFilter === 'users' && t('chat.noUserChats', { defaultValue: 'Start chatting with players' })}
          {chatsFilter === 'bugs' && t('chat.noBugChats', { defaultValue: 'No bug reports yet' })}
          {chatsFilter === 'channels' && t('chat.noChannels', { defaultValue: 'No channels yet' })}
        </p>
      </div>
    );
  }

  return (
    <>
      {!isDesktop && (
        <RefreshIndicator
          isRefreshing={isRefreshing}
          pullDistance={pullDistance}
          pullProgress={pullProgress}
        />
      )}
      <div
        className={isDesktop ? 'overflow-y-auto scrollbar-auto h-full bg-white dark:bg-gray-900 flex flex-col min-h-0 pb-20' : ''}
        style={{
          transform: isDesktop ? 'none' : `translateY(${pullDistance}px)`,
          transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {chatsFilter === 'users' && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
              <input
                type="text"
                placeholder={t('chat.search', { defaultValue: 'Search' })}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Clear search"
                >
                  <X size={16} className="text-gray-400 dark:text-gray-500" />
                </button>
              )}
            </div>
          </div>
        )}
        {filteredChats.map((chat) => {
          if (chat.type === 'user') {
            const key = `${chat.type}-${chat.data.id}`;
            const liveChat = liveChats[chat.data.id] || chat.data;
            const liveUnreadCount = liveUnreadCounts[chat.data.id] || 0;
            const isSelected = selectedChatType === 'user' && selectedChatId === chat.data.id;
            return (
              <UserChatCard
                key={key}
                chat={liveChat}
                unreadCount={liveUnreadCount}
                onClick={() => handleChatClick(chat.data.id, 'user')}
                isSelected={isSelected}
                draft={chat.draft}
              />
            );
          } else if (chat.type === 'contact') {
            const key = `${chat.type}-${chat.userId}`;
            const mockChat: UserChat = {
              id: '',
              user1Id: user?.id || '',
              user2Id: chat.userId,
              user1: user!,
              user2: chat.user,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            return (
              <UserChatCard
                key={key}
                chat={mockChat}
                unreadCount={0}
                onClick={() => handleContactClick(chat.userId)}
                isSelected={false}
              />
            );
          } else if (chat.type === 'bug') {
            const key = `${chat.type}-${chat.data.id}`;
            const isSelected = selectedChatType === 'bug' && selectedChatId === chat.data.id;
            return (
              <div key={key} className={`border-b border-gray-200 dark:border-gray-700 last:border-b-0 [&>div]:mb-0 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <BugCard
                  bug={chat.data}
                  unreadCount={chat.unreadCount}
                  onUpdate={() => {
                    if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels') {
                      fetchChatsForFilter(chatsFilter);
                    }
                  }}
                  onDelete={(bugId) => {
                    setChats(prev => prev.filter(c => !(c.type === 'bug' && c.data.id === bugId)));
                  }}
                />
              </div>
            );
          } else if (chat.type === 'group' || chat.type === 'channel') {
            const key = `${chat.type}-${chat.data.id}`;
            const chatTypeForNavigation = chat.type === 'channel' ? 'channel' : 'group';
            const isSelected = (selectedChatType === 'group' || selectedChatType === 'channel') && selectedChatId === chat.data.id;
            return (
              <div key={key} className={`border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <GroupChannelCard
                  groupChannel={chat.data}
                  unreadCount={chat.unreadCount}
                  onClick={() => handleChatClick(chat.data.id, chatTypeForNavigation)}
                  isSelected={isSelected}
                  draft={chat.type === 'group' ? chat.draft : undefined}
                />
              </div>
            );
          }
        })}
      </div>
    </>
  );
};
