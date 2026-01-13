import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { UserChatCard } from './UserChatCard';
import { BugCard } from '@/components/bugs/BugCard';
import { chatApi, UserChat } from '@/api/chat';
import { bugsApi } from '@/api/bugs';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useNavigationStore } from '@/store/navigationStore';
import { Bug, BasicUser } from '@/types';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { MessageCircle } from 'lucide-react';

type ChatItem =
  | { type: 'user'; data: UserChat; lastMessageDate: Date; unreadCount: number; otherUser?: BasicUser }
  | { type: 'contact'; userId: string; user: BasicUser; interactionCount: number; isFavorite: boolean }
  | { type: 'bug'; data: Bug; lastMessageDate: Date; unreadCount: number };

interface ChatListProps {
  onChatSelect?: (chatId: string, chatType: 'user' | 'bug') => void;
  isDesktop?: boolean;
  selectedChatId?: string | null;
  selectedChatType?: 'user' | 'bug' | null;
}

export const ChatList = ({ onChatSelect, isDesktop = false, selectedChatId, selectedChatType }: ChatListProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { chatsFilter } = useNavigationStore();
  const favoriteUserIds = useFavoritesStore((state) => state.favoriteUserIds);
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const liveUnreadCounts = usePlayersStore((state) => state.unreadCounts);
  const liveChats = usePlayersStore((state) => state.chats);

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
    }
  }, [user?.id, fetchFavorites]);

  const sortUserChatItems = useCallback((chatItems: ChatItem[], getUserMetadata: (userId: string) => { interactionCount?: number; lastFetchedAt?: number } | undefined) => {
    return chatItems.sort((a, b) => {
      if (a.type === 'user' && b.type === 'contact') return -1;
      if (a.type === 'contact' && b.type === 'user') return 1;
      
      if (a.type === 'user' && b.type === 'user') {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
        
        const aOtherUserId = a.data.user1Id === user!.id ? a.data.user2Id : a.data.user1Id;
        const bOtherUserId = b.data.user1Id === user!.id ? b.data.user2Id : b.data.user1Id;
        const aIsFavorite = favoriteUserIds.includes(aOtherUserId);
        const bIsFavorite = favoriteUserIds.includes(bOtherUserId);
        
        if (aIsFavorite && !bIsFavorite) return -1;
        if (!aIsFavorite && bIsFavorite) return 1;
        
        const aMetadata = getUserMetadata(aOtherUserId);
        const bMetadata = getUserMetadata(bOtherUserId);
        const aInteractionCount = aMetadata?.interactionCount || 0;
        const bInteractionCount = bMetadata?.interactionCount || 0;
        
        if (aInteractionCount !== bInteractionCount) {
          return bInteractionCount - aInteractionCount;
        }
        
        return b.lastMessageDate.getTime() - a.lastMessageDate.getTime();
      }
      
      if (a.type === 'contact' && b.type === 'contact') {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        
        if (a.interactionCount !== b.interactionCount) {
          return b.interactionCount - a.interactionCount;
        }
        
        return a.userId.localeCompare(b.userId);
      }
      
      return 0;
    });
  }, [user, favoriteUserIds]);

  const fetchChatsForFilter = useCallback(async (filter: 'users' | 'bugs') => {
    if (!user) return;

    try {
      setLoading(true);
      const chatItems: ChatItem[] = [];

      if (filter === 'users') {
        const { fetchPlayers, fetchUserChats } = usePlayersStore.getState();
        await Promise.all([fetchPlayers(), fetchUserChats()]);
        
        const { users, chats: userChats, getUserMetadata, unreadCounts } = usePlayersStore.getState();

        const blockedUserIds = user.blockedUserIds || [];
        const processedUserIds = new Set<string>();

        Object.values(userChats).forEach(chat => {
          const otherUserId = chat.user1Id === user.id ? chat.user2Id : chat.user1Id;
          const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
          
          if (otherUserId && !blockedUserIds.includes(otherUserId)) {
            processedUserIds.add(otherUserId);
            chatItems.push({
              type: 'user',
              data: chat,
              lastMessageDate: chat.lastMessage 
                ? new Date(chat.lastMessage.createdAt)
                : new Date(chat.updatedAt),
              unreadCount: unreadCounts[chat.id] || 0,
              otherUser
            });
          }
        });

        Object.values(users).forEach((userData) => {
          const userId = userData.id;
          if (processedUserIds.has(userId) || userId === user.id || blockedUserIds.includes(userId)) return;

          const favorite = favoriteUserIds.includes(userId);
          const metadata = getUserMetadata(userId);
          
          chatItems.push({
            type: 'contact',
            userId,
            user: userData,
            interactionCount: metadata?.interactionCount || 0,
            isFavorite: favorite
          });
        });

        sortUserChatItems(chatItems, getUserMetadata);
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
      }

      if (filter !== 'users') {
        chatItems.sort((a, b) => {
          if (a.type !== 'contact' && b.type !== 'contact') {
            return b.lastMessageDate.getTime() - a.lastMessageDate.getTime();
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
    if (chatsFilter === 'users' || chatsFilter === 'bugs') {
      fetchChatsForFilter(chatsFilter);
    }
  }, [fetchChatsForFilter, chatsFilter]);

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    if (chatsFilter === 'users' || chatsFilter === 'bugs') {
      await fetchChatsForFilter(chatsFilter);
    }
  }, [fetchChatsForFilter, chatsFilter]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading || isDesktop,
  });

  const handleChatClick = (chatId: string, chatType: 'user' | 'bug') => {
    if (onChatSelect) {
      onChatSelect(chatId, chatType);
    }
  };

  const handleContactClick = async (userId: string) => {
    if (!user) return;
    
    try {
      const response = await chatApi.getOrCreateChatWithUser(userId);
      const chat = response.data;
      
      const { addChat, getUserMetadata } = usePlayersStore.getState();
      await addChat(chat);
      
      const updatedUnreadCounts = usePlayersStore.getState().unreadCounts;
      const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
      
      if (chatsFilter === 'users' && otherUser) {
        setChats((prevChats) => {
          const filteredChats = prevChats.filter(
            (item) => !(item.type === 'contact' && item.userId === userId)
          );
          
          const newChatItem: ChatItem = {
            type: 'user',
            data: chat,
            lastMessageDate: chat.lastMessage 
              ? new Date(chat.lastMessage.createdAt)
              : new Date(chat.updatedAt),
            unreadCount: updatedUnreadCounts[chat.id] || 0,
            otherUser,
          };
          
          const updatedChats = [...filteredChats, newChatItem];
          sortUserChatItems(updatedChats, getUserMetadata);
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
        {chats.map((chat) => {
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
                    if (chatsFilter === 'users' || chatsFilter === 'bugs') {
                      fetchChatsForFilter(chatsFilter);
                    }
                  }}
                  onDelete={(bugId) => {
                    setChats(prev => prev.filter(c => !(c.type === 'bug' && c.data.id === bugId)));
                  }}
                />
              </div>
            );
          }
        })}
      </div>
    </>
  );
};
