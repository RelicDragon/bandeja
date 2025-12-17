import { useState, useEffect, useRef } from 'react';
import { PlayerAvatar } from '@/components';
import { GameParticipant } from '@/types';
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
  onLeave,
  onShowPlayerList,
}: PlayersCarouselProps) => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const checkScrollPosition = () => {
    const container = carouselRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    checkScrollPosition();

    const container = carouselRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkScrollPosition();
    };

    container.addEventListener('scroll', handleScroll);

    const resizeObserver = new ResizeObserver(() => {
      checkScrollPosition();
    });

    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [participants, emptySlots]);

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
        >
          <div className="flex gap-2 pt-1 pb-1">
            {participants.map((participant) => (
              <div key={participant.userId} className="flex-shrink-0 w-16">
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
                />
              </div>
            ))}
            {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} className="flex-shrink-0 w-16">
                {canInvitePlayers ? (
                  <button
                    onClick={() => onShowPlayerList?.(gender)}
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
            <div className="absolute left-0 top-7 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center pointer-events-none z-20">
              <ChevronLeft size={14} className="text-gray-400 dark:text-gray-500" />
            </div>
          </>
        )}
        {showRightFade && (
          <>
            <div className="absolute top-0 bottom-0 -right-1 w-8 bg-gradient-to-l from-white from-0% via-white/90 via-30% to-transparent to-100% dark:from-gray-900 dark:via-gray-900/90 pointer-events-none z-10" />
            <div className="absolute right-0 top-7 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center pointer-events-none z-20">
              <ChevronRight size={14} className="text-gray-400 dark:text-gray-500" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
