import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { UserChat } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePlayersStore } from '@/store/playersStore';
import { GameParticipant, BasicUser } from '@/types';
import { matchesSearch } from '@/utils/transliteration';

interface ContactItem {
  type: 'search' | 'user';
  userId?: string;
  chat?: UserChat;
  unreadCount?: number;
  interactionCount?: number;
  isFavorite?: boolean;
  user?: BasicUser;
}

export const Contacts = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { showChatFilter } = useHeaderStore();
  const favoriteUserIds = useFavoritesStore((state) => state.favoriteUserIds);
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  
  const {
    users,
    chats,
    loading,
    chatsLoading,
    fetchPlayers,
    fetchUserChats,
    fetchUnreadCounts,
    getUserMetadata,
    getUnreadCountByUserId,
  } = usePlayersStore();

  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
      fetchUserChats();
      fetchPlayers();
    }
  }, [user?.id, fetchFavorites, fetchUserChats, fetchPlayers]);

  const prevShowChatFilterRef = useRef(showChatFilter);
  useEffect(() => {
    if (showChatFilter && !prevShowChatFilterRef.current && user?.id) {
      fetchUserChats();
      fetchUnreadCounts();
      fetchPlayers();
    }
    prevShowChatFilterRef.current = showChatFilter;
  }, [showChatFilter, user?.id, fetchUserChats, fetchUnreadCounts, fetchPlayers]);

  const contacts = useMemo(() => {
    if (loading || chatsLoading) return [];

    const blockedUserIds = user?.blockedUserIds || [];

    const processedUserIds = new Set<string>();
    const unreadChats: ContactItem[] = [];
    const favoriteNoUnread: ContactItem[] = [];
    const others: ContactItem[] = [];

    Object.values(chats).forEach((chat: UserChat) => {
      const otherUserId = chat.user1Id === user?.id ? chat.user2Id : chat.user1Id;
      
      if (!otherUserId || blockedUserIds.includes(otherUserId)) {
        return;
      }

      const unreadCount = getUnreadCountByUserId(otherUserId);
      const favorite = favoriteUserIds.includes(otherUserId);

      if (showChatFilter && unreadCount === 0) {
        return;
      }

      const otherUser = chat.user1Id === user?.id ? chat.user2 : chat.user1;
      const metadata = getUserMetadata(otherUserId);
      const contact: ContactItem = {
        type: 'user',
        userId: otherUserId,
        chat,
        unreadCount,
        interactionCount: metadata?.interactionCount || 0,
        isFavorite: favorite,
        user: otherUser
      };

      processedUserIds.add(otherUserId);

      if (unreadCount > 0) {
        unreadChats.push(contact);
      } else if (favorite) {
        favoriteNoUnread.push(contact);
      } else {
        others.push(contact);
      }
    });

    if (!showChatFilter) {
      Object.values(users).forEach((userData) => {
        const userId = userData.id;
        if (processedUserIds.has(userId) || userId === user?.id || blockedUserIds.includes(userId)) return;

        const favorite = favoriteUserIds.includes(userId);
        const metadata = getUserMetadata(userId);
        const contact: ContactItem = {
          type: 'user',
          userId,
          interactionCount: metadata?.interactionCount || 0,
          isFavorite: favorite,
          user: userData
        };

        if (favorite) {
          favoriteNoUnread.push(contact);
        } else {
          others.push(contact);
        }
      });
    }

    const sortUnreadChats = (a: ContactItem, b: ContactItem) => {
      const favoriteDiff = (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
      if (favoriteDiff !== 0) return favoriteDiff;
      const interactionDiff = (b.interactionCount || 0) - (a.interactionCount || 0);
      if (interactionDiff !== 0) return interactionDiff;
      return (a.userId || '').localeCompare(b.userId || '');
    };

    const sortByInteractions = (a: ContactItem, b: ContactItem) => {
      const interactionDiff = (b.interactionCount || 0) - (a.interactionCount || 0);
      if (interactionDiff !== 0) return interactionDiff;
      return (a.userId || '').localeCompare(b.userId || '');
    };

    unreadChats.sort(sortUnreadChats);
    favoriteNoUnread.sort(sortByInteractions);
    others.sort(sortByInteractions);

    return [
      ...unreadChats,
      ...favoriteNoUnread,
      ...others
    ];
  }, [loading, chatsLoading, chats, users, user?.id, user?.blockedUserIds, showChatFilter, favoriteUserIds, getUnreadCountByUserId, getUserMetadata]);


  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  const filteredContacts = useMemo(() => {
    if (!debouncedSearchTerm) return contacts;
    
    return contacts.filter(contact => {
      if (!contact.user) return false;
      const fullName = `${contact.user.firstName || ''} ${contact.user.lastName || ''}`;
      return matchesSearch(debouncedSearchTerm, fullName);
    });
  }, [debouncedSearchTerm, contacts]);

  const hasUnreadContacts = useMemo(() => {
    return filteredContacts.some(contact => (contact.unreadCount ?? 0) > 0);
  }, [filteredContacts]);

  const participants = useMemo(() => {
    return filteredContacts
      .filter(contact => contact.user)
      .map((contact): GameParticipant => ({
        userId: contact.userId || contact.user!.id,
        role: 'PARTICIPANT',
        isPlaying: true,
        joinedAt: new Date().toISOString(),
        user: contact.user!,
      }));
  }, [filteredContacts]);

  const participantUnreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredContacts.forEach(contact => {
      if (contact.userId && contact.unreadCount) {
        counts[contact.userId] = contact.unreadCount;
      }
    });
    return counts;
  }, [filteredContacts]);

  const handleSearchClick = () => {
    setShowSearch(true);
  };

  const handleCloseSearch = () => {
    setShowSearch(false);
    setSearchTerm('');
    setDebouncedSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.blur();
    }
  };




  if (loading) {
    return null;
  }

  if (contacts.length === 0) {
    return null;
  }

  return (
    <div className="-mb-4 -mt-2">
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          showSearch ? 'max-h-20 opacity-100 mb-3' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 p-3">
            <Search size={20} className="text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onBlur={() => {
                setTimeout(() => {
                  if (searchTerm.length === 0) {
                    handleCloseSearch();
                  }
                }, 150);
              }}
              placeholder={t('contacts.searchPlaceholder')}
              className="flex-1 bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-400"
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleCloseSearch();
              }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-2">
        <div
          onClick={handleSearchClick}
          className={`pb-4 flex-shrink-0 cursor-pointer hover:opacity-80 transition-all duration-300 ease-in-out overflow-hidden ${
            showSearch || (showChatFilter && hasUnreadContacts) ? 'w-0 opacity-0' : 'w-12 opacity-100'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border-2 border-gray-300 dark:border-gray-600">
            <Search size={20} className="text-gray-600 dark:text-gray-400" />
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {debouncedSearchTerm && filteredContacts.length === 0 ? (
            <div className="w-full pb-3">
              <div className="text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 text-center">
                {t('contacts.noPlayersFound')}
              </div>
            </div>
          ) : (
            <div className="pb-2 pl-1 pr-2 pt-2">
              <PlayersCarousel
                participants={participants}
                userId={user?.id}
                autoHideNames={!showSearch}
                participantUnreadCounts={participantUnreadCounts}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

