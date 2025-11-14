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
  const isFavorite = useFavoritesStore((state) => state.isFavorite);

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
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;

      setLoading(true);
      try {
        const [chatsResponse, playersResponse] = await Promise.all([
          chatApi.getUserChats(),
          usersApi.getInvitablePlayers()
        ]);

        const chats = chatsResponse.data || [];
        setUserChats(chats);

        if (chats.length > 0) {
          const chatIds = chats.map(chat => chat.id);
          const unreadResponse = await chatApi.getUserChatsUnreadCounts(chatIds);
          setUserChatsUnreadCounts(unreadResponse.data || {});
        }

        setAllPlayers(playersResponse.data || []);
      } catch (error) {
        console.error('Failed to load contacts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id]);

  const contacts = useMemo(() => {
    const items: ContactItem[] = [];

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
      const unreadCount = unreadMap.get(userId) || 0;
      const player = playerMap.get(userId);
      const favorite = isFavorite(userId);

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
        if (processedUserIds.has(userId) || userId === user?.id) return;

        const favorite = isFavorite(userId);
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

    const sortByInteractions = (a: ContactItem, b: ContactItem) => {
      return (b.interactionCount || 0) - (a.interactionCount || 0);
    };

    unreadChats.sort(sortByInteractions);
    favoriteNoUnread.sort(sortByInteractions);
    others.sort(sortByInteractions);

    items.push(...unreadChats);
    items.push(...favoriteNoUnread);
    items.push(...others);

    return items;
  }, [userChats, userChatsUnreadCounts, allPlayers, user?.id, showChatFilter, isFavorite]);

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
    };
  }, [filteredContacts, isMobile]);

  const handleSearchClick = () => {
    setShowSearch(true);
  };

  const handleCloseSearch = () => {
    setShowSearch(false);
    setSearchTerm('');
    setDebouncedSearchTerm('');
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
    <div className="mb-4 px-4">
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

      <div className="flex items-center gap-2">
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
          <div 
            ref={carouselRef}
            className="flex items-center gap-2 overflow-x-auto pb-2 pl-1 pr-2 pt-2 scrollbar-hide"
          >
            {filteredContacts.map((contact, index) => {
          if (!contact.user) return null;
          const showName = (isMobile && isScrolling) || showSearch;

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
          {showLeftFade && (
            <div className="absolute left-0 -top-2 bottom-0 w-8 bg-gradient-to-r from-gray-50 via-gray-50/80 to-transparent dark:from-gray-900 dark:via-gray-900/80 pointer-events-none z-10" />
          )}
          {showRightFade && (
            <div className="absolute right-0 -top-2 bottom-0 w-8 bg-gradient-to-l from-gray-50 via-gray-50/80 to-transparent dark:from-gray-900 dark:via-gray-900/80 pointer-events-none z-10" />
          )}
        </div>
      </div>
    </div>
  );
};

