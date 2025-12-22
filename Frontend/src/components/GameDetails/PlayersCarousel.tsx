import { useState, useEffect, useRef } from 'react';
import { PlayerAvatar } from '@/components';
import { GameParticipant } from '@/types';
import { chatApi } from '@/api/chat';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import 'bootstrap-icons/font/bootstrap-icons.css';

interface PlayersCarouselProps {
  participants: GameParticipant[];
  emptySlots?: number;
  showGenderIndicator?: boolean;
  gender?: 'MALE' | 'FEMALE';
  genderCount?: number;
  userId?: string;
  shouldShowCrowns?: boolean;
  canInvitePlayers?: boolean;
  autoHideNames?: boolean;
  participantUnreadCounts?: Record<string, number>;
  onLeave?: () => void;
  onShowPlayerList?: (gender?: 'MALE' | 'FEMALE') => void;
}

export const PlayersCarousel = ({
  participants,
  emptySlots = 0,
  showGenderIndicator = false,
  gender,
  genderCount,
  userId,
  shouldShowCrowns = false,
  canInvitePlayers = false,
  autoHideNames = false,
  participantUnreadCounts,
  onLeave,
  onShowPlayerList,
}: PlayersCarouselProps) => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    const fetchUnreadCounts = async () => {
      if (!userId || participants.length === 0) return;

      try {
        const participantUserIds = new Set(participants.map(p => p.userId));
        const chatsResponse = await chatApi.getUserChats();
        const chats = chatsResponse.data || [];

        const relevantChats = chats.filter(chat => {
          const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
          return participantUserIds.has(otherUserId);
        });

        if (relevantChats.length > 0) {
          const chatIds = relevantChats.map(chat => chat.id);
          const unreadResponse = await chatApi.getUserChatsUnreadCounts(chatIds);
          const chatUnreadCounts = unreadResponse.data || {};

          const userIdUnreadCounts: Record<string, number> = {};
          relevantChats.forEach(chat => {
            const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
            const unreadCount = chatUnreadCounts[chat.id] || 0;
            if (unreadCount > 0) {
              userIdUnreadCounts[otherUserId] = unreadCount;
            }
          });

          setUnreadCounts(userIdUnreadCounts);
        } else {
          setUnreadCounts({});
        }
      } catch (error) {
        console.error('Failed to fetch unread counts:', error);
      }
    };

    fetchUnreadCounts();
  }, [participants, userId]);

  useEffect(() => {
    checkScrollPosition();

    const container = carouselRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkScrollPosition();
      
      if (autoHideNames && isMobile) {
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
  }, [participants, emptySlots, autoHideNames, isMobile]);

  const scrollLeft = () => {
    const container = carouselRef.current;
    if (!container) return;
    const scrollAmount = container.clientWidth * 0.8;
    container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  };

  const scrollRight = () => {
    const container = carouselRef.current;
    if (!container) return;
    const scrollAmount = container.clientWidth * 0.8;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const handlePressStart = () => {
    if (!autoHideNames) return;
    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current);
    }
    pressTimeoutRef.current = setTimeout(() => {
      setIsPressed(true);
    }, 300);
  };

  const handlePressEnd = () => {
    if (!autoHideNames) return;
    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }
    setIsPressed(false);
  };

  const renderGenderIndicator = (gender: 'MALE' | 'FEMALE') => (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
      gender === 'MALE' 
        ? 'bg-blue-500 dark:bg-blue-600' 
        : 'bg-pink-500 dark:bg-pink-600'
    }`}>
      <i className={`bi ${gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'} text-white text-[10px]`}></i>
    </div>
  );

  return (
    <div className={showGenderIndicator && gender ? "flex gap-3 -mx-4 px-4" : "relative"}>
      {showGenderIndicator && gender && (
        <div className="flex-shrink-0 flex flex-col items-center pt-1 pb-10">
          {renderGenderIndicator(gender)}
          <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {genderCount ?? participants.length}
          </span>
        </div>
      )}
      <div className={showGenderIndicator && gender ? "flex-1 relative min-w-0" : "relative"}>
        <div 
          ref={carouselRef}
          className="overflow-x-auto overflow-y-hidden scrollbar-hide"
          onMouseDown={autoHideNames ? handlePressStart : undefined}
          onMouseUp={autoHideNames ? handlePressEnd : undefined}
          onMouseLeave={autoHideNames ? handlePressEnd : undefined}
          onTouchStart={autoHideNames ? handlePressStart : undefined}
          onTouchEnd={autoHideNames ? handlePressEnd : undefined}
          onTouchCancel={autoHideNames ? handlePressEnd : undefined}
        >
          <div className="flex gap-2 pt-1 pb-1">
            {participants.map((participant) => {
              const showName = autoHideNames ? ((isMobile && isScrolling) || isPressed) : undefined;
              const unreadCount = participantUnreadCounts?.[participant.userId] ?? unreadCounts[participant.userId] ?? 0;
              return (
                <div key={participant.userId} className="flex-shrink-0 w-16 relative">
                  <PlayerAvatar
                    player={{
                      id: participant.user.id,
                      firstName: participant.user.firstName,
                      lastName: participant.user.lastName,
                      avatar: participant.user.avatar,
                      level: participant.user.level,
                      gender: participant.user.gender,
                    }}
                    isCurrentUser={participant.user.id === userId}
                    removable={participant.user.id === userId}
                    onRemoveClick={participant.user.id === userId ? onLeave : undefined}
                    role={shouldShowCrowns ? (participant.role as 'OWNER' | 'ADMIN' | 'PLAYER') : undefined}
                    smallLayout={true}
                    showName={showName}
                  />
                  {unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center border-2 border-white dark:border-gray-900">
                      <span className="text-[10px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} className="flex-shrink-0 w-16">
                {canInvitePlayers ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowPlayerList?.(gender);
                    }}
                    className="flex flex-col items-center w-full"
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-800/30 transition-colors">
                      <Plus className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    </div>
                  </button>
                ) : (
                  <PlayerAvatar
                    player={null}
                    smallLayout={true}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        {showLeftFade && (
          <>
            <div className="absolute top-0 bottom-0 -left-1 w-8 bg-gradient-to-r from-white from-0% via-white/90 via-30% to-transparent to-100% dark:from-gray-900 dark:via-gray-900/90 pointer-events-none z-10" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollLeft();
              }}
              className="absolute left-0 top-7 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer z-20"
            >
              <ChevronLeft size={14} className="text-gray-400 dark:text-gray-500" />
            </button>
          </>
        )}
        {showRightFade && (
          <>
            <div className="absolute top-0 bottom-0 -right-1 w-8 bg-gradient-to-l from-white from-0% via-white/90 via-30% to-transparent to-100% dark:from-gray-900 dark:via-gray-900/90 pointer-events-none z-10" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollRight();
              }}
              className="absolute right-0 top-7 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer z-20"
            >
              <ChevronRight size={14} className="text-gray-400 dark:text-gray-500" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
