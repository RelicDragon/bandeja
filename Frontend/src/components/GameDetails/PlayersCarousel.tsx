import { useState, useEffect, useRef } from 'react';
import { motion, type Variants } from 'framer-motion';
import { PlayerAvatar } from '@/components';
import { GameParticipant } from '@/types';
import type { Sport } from '@shared/sport';
import { useUnreadByUserIdBridge } from '@/hooks/useUnreadBridge';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import 'bootstrap-icons/font/bootstrap-icons.css';

const slotVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { delay: i * 0.05, type: 'spring', stiffness: 260, damping: 22 },
  }),
};

function EmptyParticipantSlot({
  index,
  canInvite,
  onInvite,
}: {
  index: number;
  canInvite: boolean;
  onInvite?: () => void;
}) {
  if (!canInvite) {
    return (
      <motion.div
        custom={index}
        variants={slotVariants}
        initial="hidden"
        animate="visible"
        className="flex-shrink-0 w-16 pt-1 pb-4"
      >
        <PlayerAvatar player={null} smallLayout={true} />
      </motion.div>
    );
  }

  return (
    <motion.div
      custom={index}
      variants={slotVariants}
      initial="hidden"
      animate="visible"
      className="flex-shrink-0 w-16 pt-1 pb-4"
    >
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onInvite?.();
        }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="group flex w-full flex-col items-center"
      >
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-primary-300/80 bg-gradient-to-br from-primary-50 to-white transition-colors group-hover:border-primary-400 group-hover:from-primary-100 dark:border-primary-600/70 dark:from-primary-950/50 dark:to-gray-900 dark:group-hover:border-primary-500 dark:group-hover:from-primary-900/40">
          <span className="absolute inset-0 rounded-full bg-primary-400/0 transition-colors group-hover:bg-primary-400/10" />
          <Plus className="relative h-5 w-5 text-primary-500 transition-transform group-hover:scale-110 dark:text-primary-400" />
        </div>
        <div className="h-8" aria-hidden />
      </motion.button>
    </motion.div>
  );
}

function ParticipantCarouselSlot({
  participant,
  propUnread = 0,
  userId,
  shouldShowCrowns,
  draggable,
  draggedPlayerId,
  onLeave,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  showName,
  levelSport,
  slotIndex = 0,
}: {
  participant: GameParticipant;
  propUnread?: number;
  userId?: string;
  shouldShowCrowns: boolean;
  draggable: boolean;
  draggedPlayerId?: string | null;
  onLeave?: () => void;
  onDragStart?: (e: React.DragEvent, playerId: string) => void;
  onDragEnd?: () => void;
  onTouchStart?: (e: TouchEvent, playerId: string) => void;
  onTouchMove?: (e: TouchEvent) => void;
  onTouchEnd?: (e: TouchEvent) => void;
  showName?: boolean;
  levelSport?: Sport;
  slotIndex?: number;
}) {
  const unreadCount = useUnreadByUserIdBridge(participant.userId, propUnread);
  const isDragged = draggedPlayerId === participant.user.id;
  return (
    <motion.div
      layout
      custom={slotIndex}
      variants={slotVariants}
      initial="hidden"
      animate="visible"
      className={`relative w-16 flex-shrink-0 pt-1 pb-4 ${
        isDragged ? 'opacity-0' : ''
      }`}
      whileHover={draggable ? { scale: 1.05 } : undefined}
    >
      <PlayerAvatar
        player={participant.user}
        isCurrentUser={participant.user.id === userId}
        removable={participant.user.id === userId}
        onRemoveClick={participant.user.id === userId ? onLeave : undefined}
        role={shouldShowCrowns ? (participant.role as 'OWNER' | 'ADMIN' | 'PLAYER') : undefined}
        smallLayout={true}
        showName={showName}
        draggable={draggable}
        onDragStart={draggable && onDragStart ? (e) => onDragStart(e, participant.user.id) : undefined}
        onDragEnd={draggable ? onDragEnd : undefined}
        onTouchStart={draggable && onTouchStart ? (e) => onTouchStart(e, participant.user.id) : undefined}
        onTouchMove={draggable ? onTouchMove : undefined}
        onTouchEnd={draggable ? onTouchEnd : undefined}
        levelSport={levelSport}
      />
      {unreadCount > 0 && (
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center border-2 border-white dark:border-gray-900">
          <span className="text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        </div>
      )}
    </motion.div>
  );
}

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
  draggable?: boolean;
  draggedPlayerId?: string | null;
  onDragStart?: (e: React.DragEvent, playerId: string) => void;
  onDragEnd?: () => void;
  onTouchStart?: (e: TouchEvent, playerId: string) => void;
  onTouchMove?: (e: TouchEvent) => void;
  onTouchEnd?: (e: TouchEvent) => void;
  levelSport?: Sport;
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
  draggable = false,
  draggedPlayerId,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  levelSport,
}: PlayersCarouselProps) => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
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
    <div
      className={`flex h-7 w-7 items-center justify-center rounded-full shadow-sm ${
        gender === 'MALE'
          ? 'bg-blue-500 dark:bg-blue-600'
          : 'bg-pink-500 dark:bg-pink-600'
      }`}
    >
      <i
        className={`bi ${gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'} text-[11px] text-white`}
      />
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
          className="touch-pan-x overscroll-x-contain overflow-x-auto overflow-y-hidden scrollbar-hide [-webkit-overflow-scrolling:touch]"
          onMouseDown={autoHideNames ? handlePressStart : undefined}
          onMouseUp={autoHideNames ? handlePressEnd : undefined}
          onMouseLeave={autoHideNames ? handlePressEnd : undefined}
          onTouchStart={autoHideNames ? handlePressStart : undefined}
          onTouchEnd={autoHideNames ? handlePressEnd : undefined}
          onTouchCancel={autoHideNames ? handlePressEnd : undefined}
        >
          <div className="flex gap-2">
            {participants.map((participant, index) => (
              <ParticipantCarouselSlot
                key={participant.userId}
                participant={participant}
                propUnread={participantUnreadCounts?.[participant.userId] ?? 0}
                userId={userId}
                shouldShowCrowns={shouldShowCrowns}
                draggable={draggable}
                draggedPlayerId={draggedPlayerId}
                onLeave={onLeave}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                showName={autoHideNames ? ((isMobile && isScrolling) || isPressed) : undefined}
                levelSport={levelSport}
                slotIndex={index}
              />
            ))}
            {emptySlots > 0 &&
              Array.from({ length: emptySlots }).map((_, i) => (
                <EmptyParticipantSlot
                  key={`empty-${i}`}
                  index={participants.length + i}
                  canInvite={canInvitePlayers}
                  onInvite={() => onShowPlayerList?.(gender)}
                />
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
