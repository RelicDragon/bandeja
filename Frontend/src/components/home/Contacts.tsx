import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { chatApi, UserChat } from '@/api/chat';
import { usersApi, InvitablePlayer } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useFavoritesStore } from '@/store/favoritesStore';

interface ContactItem {
  type: 'search' | 'user';
  userId?: string;
  chat?: UserChat;
  unreadCount?: number;
  interactionCount?: number;
  isFavorite?: boolean;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  };
}

export const Contacts = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { showChatFilter } = useHeaderStore();
  const favoriteUserIds = useFavoritesStore((state) => state.favoriteUserIds);
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);

  const [userChats, setUserChats] = useState<UserChat[]>([]);
  const [userChatsUnreadCounts, setUserChatsUnreadCounts] = useState<Record<string, number>>({});
  const [allPlayers, setAllPlayers] = useState<InvitablePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const carouselRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;

      setLoading(true);
      try {
        const [chatsResponse, playersResponse] = await Promise.all([
          chatApi.getUserChats(),
          usersApi.getInvitablePlayers()
        ]);

        await fetchFavorites();

        const chats = chatsResponse.data || [];
        let unreadCounts: Record<string, number> = {};

        if (chats.length > 0) {
          const chatIds = chats.map(chat => chat.id);
          const unreadResponse = await chatApi.getUserChatsUnreadCounts(chatIds);
          unreadCounts = unreadResponse.data || {};
        }

        setUserChats(chats);
        setUserChatsUnreadCounts(unreadCounts);
        setAllPlayers(playersResponse.data || []);
      } catch (error) {
        console.error('Failed to load contacts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id, fetchFavorites]);

  const contacts = useMemo(() => {
    if (loading) return [];

    const blockedUserIds = user?.blockedUserIds || [];

    const chatMap = new Map<string, UserChat>();
    const unreadMap = new Map<string, number>();
    const playerMap = new Map<string, InvitablePlayer>();

    userChats.forEach(chat => {
      const otherUserId = chat.user1Id === user?.id ? chat.user2Id : chat.user1Id;
      chatMap.set(otherUserId, chat);
      unreadMap.set(otherUserId, userChatsUnreadCounts[chat.id] || 0);
    });

    allPlayers.forEach(player => {
      playerMap.set(player.id, player);
    });

    const processedUserIds = new Set<string>();
    const unreadChats: ContactItem[] = [];
    const favoriteNoUnread: ContactItem[] = [];
    const others: ContactItem[] = [];

    chatMap.forEach((chat, userId) => {
      if (blockedUserIds.includes(userId)) {
        return;
      }

      const unreadCount = unreadMap.get(userId) || 0;
      const player = playerMap.get(userId);
      const favorite = favoriteUserIds.includes(userId);

      if (showChatFilter && unreadCount === 0) {
        return;
      }

      const otherUser = chat.user1Id === user?.id ? chat.user2 : chat.user1;
      const contact: ContactItem = {
        type: 'user',
        userId,
        chat,
        unreadCount,
        interactionCount: player?.interactionCount || 0,
        isFavorite: favorite,
        user: otherUser
      };

      processedUserIds.add(userId);

      if (unreadCount > 0) {
        unreadChats.push(contact);
      } else if (favorite) {
        favoriteNoUnread.push(contact);
      } else {
        others.push(contact);
      }
    });

    if (!showChatFilter) {
      playerMap.forEach((player, userId) => {
        if (processedUserIds.has(userId) || userId === user?.id || blockedUserIds.includes(userId)) return;

        const favorite = favoriteUserIds.includes(userId);
        const contact: ContactItem = {
          type: 'user',
          userId,
          interactionCount: player.interactionCount || 0,
          isFavorite: favorite,
          user: {
            id: player.id,
            firstName: player.firstName,
            lastName: player.lastName,
            avatar: player.avatar,
            level: player.level,
            gender: player.gender
          }
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
  }, [loading, userChats, userChatsUnreadCounts, allPlayers, user?.id, user?.blockedUserIds, showChatFilter, favoriteUserIds]);

  const checkScrollPosition = () => {
    const container = carouselRef.current;
    if (!container) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

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
    
    const searchLower = debouncedSearchTerm.toLowerCase();
    return contacts.filter(contact => {
      if (!contact.user) return false;
      const fullName = `${contact.user.firstName || ''} ${contact.user.lastName || ''}`.toLowerCase();
      return fullName.includes(searchLower);
    });
  }, [debouncedSearchTerm, contacts]);

  const hasUnreadContacts = useMemo(() => {
    return filteredContacts.some(contact => (contact.unreadCount ?? 0) > 0);
  }, [filteredContacts]);

  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    checkScrollPosition();
    
    const handleScroll = () => {
      checkScrollPosition();
      
      if (isMobile) {
        setIsScrolling(true);
        
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        
        scrollTimeoutRef.current = setTimeout(() => {
          setIsScrolling(false);
        }, 500);
      }
    };
    
    container.addEventListener('scroll', handleScroll);
    
    const resizeObserver = new ResizeObserver(() => {
      checkScrollPosition();
    });
    resizeObserver.observe(container);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (pressTimeoutRef.current) {
        clearTimeout(pressTimeoutRef.current);
      }
    };
  }, [filteredContacts, isMobile]);

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

  const handlePressStart = () => {
    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current);
    }
    pressTimeoutRef.current = setTimeout(() => {
      setIsPressed(true);
    }, 300);
  };

  const handlePressEnd = () => {
    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }
    setIsPressed(false);
  };


  const handleUserClick = async (contact: ContactItem) => {
    if (!contact.userId || !contact.user) return;

    try {
      if (contact.chat) {
        navigate(`/user-chat/${contact.chat.id}`, { 
          state: { chat: contact.chat, contextType: 'USER' } 
        });
      } else {
        const response = await chatApi.getOrCreateChatWithUser(contact.userId);
        const chat = response.data;
        if (chat) {
          navigate(`/user-chat/${chat.id}`, { 
            state: { chat, contextType: 'USER' } 
          });
        }
      }
    } catch (error) {
      console.error('Failed to open chat:', error);
    }
  };

  if (loading) {
    return null;
  }

  if (contacts.length === 0) {
    return null;
  }

  return (
    <div className="mb-1">
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
          className={`flex-shrink-0 cursor-pointer hover:opacity-80 transition-all duration-300 ease-in-out overflow-hidden ${
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
            <div 
              ref={carouselRef}
              className="flex items-center gap-2 overflow-x-auto pb-2 pl-1 pr-2 pt-2 scrollbar-hide"
              onMouseDown={handlePressStart}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onTouchStart={handlePressStart}
              onTouchEnd={handlePressEnd}
              onTouchCancel={handlePressEnd}
            >
              {filteredContacts.map((contact, index) => {
                if (!contact.user) return null;
                const showName = (isMobile && isScrolling) || showSearch || isPressed;

                return (
                  <div
                    key={contact.userId || index}
                    onClick={() => handleUserClick(contact)}
                    className="relative flex-shrink-0 cursor-pointer group"
                  >
                    <PlayerAvatar
                      player={contact.user}
                      showName={showName}
                      smallLayout={true}
                    />
                    {(contact.unreadCount ?? 0) > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center border-2 border-white dark:border-gray-900">
                        <span className="text-[10px] font-bold text-white">
                          {(contact.unreadCount ?? 0) > 9 ? '9+' : (contact.unreadCount ?? 0)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
          )}
        </div>

        {showLeftFade && (
            <div className={`absolute top-0 bottom-0 w-8 bg-gradient-to-r from-gray-50 from-0% via-gray-50/90 via-30% to-transparent to-100% dark:from-gray-900 dark:via-gray-900/90 pointer-events-none z-10 ${
              showSearch || (showChatFilter && hasUnreadContacts) ? 'left-2' : 'left-12'
            }`} />
          )}
          {showRightFade && (
            <div className="absolute -right-1 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-50 from-0% via-gray-50/90 via-30% to-transparent to-100% dark:from-gray-900 dark:via-gray-900/90 pointer-events-none z-10" />
          )}
      </div>
    </div>
  );
};

