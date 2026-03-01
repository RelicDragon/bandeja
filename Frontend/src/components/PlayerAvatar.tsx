import { X, User, Crown, Beer, Check, Dumbbell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BasicUser } from '@/types';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { useRef, useEffect, useState, useId } from 'react';
import { GenderIndicator } from './GenderIndicator';
import { useAppModeStore } from '@/store/appModeStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useAuthStore } from '@/store/authStore';
import { usePresenceStore } from '@/store/presenceStore';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { PublicGamePrompt } from './GameDetails/PublicGamePrompt';
import { getLevelColor } from '@/utils/levelColor';
import 'bootstrap-icons/font/bootstrap-icons.css';

interface PlayerAvatarProps {
  player?: BasicUser | null;
  isCurrentUser?: boolean;
  onRemoveClick?: () => void;
  removable?: boolean;
  showName?: boolean;
  fullHideName?: boolean;
  draggable?: boolean;
  smallLayout?: boolean;
  extrasmall?: boolean;
  role?: 'OWNER' | 'ADMIN' | 'PLAYER';
  asDiv?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onTouchStart?: (e: TouchEvent) => void;
  onTouchMove?: (e: TouchEvent) => void;
  onTouchEnd?: (e: TouchEvent) => void;
}

export const PlayerAvatar = ({ player, isCurrentUser, onRemoveClick, removable, showName = true, fullHideName = false, draggable = false, smallLayout = false, extrasmall = false, role, asDiv = false, onDragStart, onDragEnd, onTouchStart, onTouchMove, onTouchEnd }: PlayerAvatarProps) => {
  const avatarPresenceKey = `avatar:${useId()}`;
  usePresenceSubscription(avatarPresenceKey, player && !isCurrentUser ? [player.id] : []);
  const { t } = useTranslation();
  const { openPlayerCard } = usePlayerCardModal();
  const { mode: appMode } = useAppModeStore();
  const isFavorite = useFavoritesStore((state) => player ? state.isFavorite(player.id) : false);
  const user = useAuthStore((state) => state.user);
  const isOnline = usePresenceStore((s) => player ? s.isOnline(player.id) : false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [showAuthModal, setShowAuthModal] = useState(false);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const getSizeClasses = () => {
    if (extrasmall) return { avatar: 'w-8 h-8', text: 'text-xs', name: 'pt-1.5   text-[10px] h-8 leading-tight', level: 'w-4 h-4 text-[8px]', crown: 'w-4 h-4', crownIcon: 8, remove: 'w-4 h-4', removeIcon: 8 };
    if (smallLayout) return { avatar: 'w-12 h-12', text: 'text-sm', name: 'mt-1 text-xs h-8 w-full', level: 'w-5 h-5 text-[10px]', crown: 'w-5 h-5', crownIcon: 10, remove: 'w-5 h-5', removeIcon: 10 };
    return { avatar: 'w-16 h-16', text: 'text-lg', name: 'mt-2 text-sm h-10', level: 'w-7 h-7 text-xs font-bold border-2', crown: 'w-6 h-6', crownIcon: 12, remove: 'w-6 h-6', removeIcon: 14 };
  };

  const sizeClasses = getSizeClasses();

  const levelBadgeTextBorder = sizeClasses.level.includes('w-4') ? 'text-[8px]' : sizeClasses.level.includes('w-5') ? 'text-[10px]' : 'text-xs font-bold border-2';
  const levelBadgeClass = `${sizeClasses.level} rounded-full flex items-center justify-center text-white ${levelBadgeTextBorder} border-white dark:border-gray-900`;
  const levelBadgeClassNoSize = `rounded-full flex items-center justify-center text-white ${levelBadgeTextBorder} border-white dark:border-gray-900`;
  const levelBadgeStyle = { boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)' };

  const getGlowStyle = () => {
    if (!isFavorite) return undefined;
    if (extrasmall) {
      return {
        boxShadow: '0 0 8px rgba(234, 179, 8, 0.6), 0 0 11px rgba(234, 179, 8, 0.4), 0 0 14px rgba(234, 179, 8, 0.2)'
      };
    }
    if (smallLayout) {
      return {
        boxShadow: '0 0 12px rgba(234, 179, 8, 0.6), 0 0 17px rgba(234, 179, 8, 0.4), 0 0 21px rgba(234, 179, 8, 0.2)'
      };
    }
    return {
      boxShadow: '0 0 16px rgba(234, 179, 8, 0.6), 0 0 22px rgba(234, 179, 8, 0.4), 0 0 28px rgba(234, 179, 8, 0.2)'
    };
  };

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || !draggable) return;

    const handleTouchStartNative = (e: TouchEvent) => {
      if (onTouchStart) {
        onTouchStart(e as any);
      }
    };

    const handleTouchMoveNative = (e: TouchEvent) => {
      if (onTouchMove) {
        onTouchMove(e as any);
      }
    };

    const handleTouchEndNative = (e: TouchEvent) => {
      if (onTouchEnd) {
        onTouchEnd(e as any);
      }
    };

    // Add native event listeners with passive: false for touchmove
    button.addEventListener('touchstart', handleTouchStartNative, { passive: true });
    button.addEventListener('touchmove', handleTouchMoveNative, { passive: false });
    button.addEventListener('touchend', handleTouchEndNative, { passive: true });

    return () => {
      button.removeEventListener('touchstart', handleTouchStartNative);
      button.removeEventListener('touchmove', handleTouchMoveNative);
      button.removeEventListener('touchend', handleTouchEndNative);
    };
  }, [draggable, onTouchStart, onTouchMove, onTouchEnd]);

  if (!player) {
    return (
      <div className="flex flex-col items-center">
        <div className={`${sizeClasses.avatar} rounded-full border-2 border-dashed border-gray-400 dark:border-gray-600 shadow-sm flex items-center justify-center`}>
          <User className={`text-gray-400 dark:text-gray-600 ${extrasmall ? 'w-4 h-4' : smallLayout ? 'w-6 h-6' : 'w-8 h-8'}`} />
        </div>
      </div>
    );
  }

  const initials = `${player.firstName?.[0] || ''}${player.lastName?.[0] || ''}`.toUpperCase();

  const levelRightClass = extrasmall && !player.approvedLevel ? '-right-1' : '-right-2';
  const trainerBadgeLeftClass = extrasmall ? '-left-1' : smallLayout ? '-left-1.5' : '-left-2';

  const onlineDotClass = player && isOnline ? 'avatar-online-dot' : '';

  const renderAvatarContent = () => (
    <>
      {player && isOnline && (
        <div
          //className={`absolute rounded-full border border-white dark:border-gray-900 z-10 ${extrasmall ? 'w-1 h-1' : 'w-1.5 h-1.5'} ${onlineDotClass} ${removable && onRemoveClick ? 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2' : 'top-1 right-1 -translate-y-1/2 translate-x-1/2'}`}
          className={`absolute rounded-full border border-white dark:border-gray-900 z-10 ${extrasmall ? 'w-1.5 h-1.5' : 'w-2 h-2'} ${onlineDotClass} ${removable && onRemoveClick ? 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2' : 'top-1 right-1 -translate-y-1/2 translate-x-1/2'}`}
          style={{
            backgroundColor: isDark ? 'rgb(37, 99, 235)' : 'rgb(59, 130, 246)'
          }}
        />
      )}
      {player.avatar ? (
        <div className="absolute inset-0 w-full h-full rounded-full overflow-hidden [&>div]:w-full [&>div]:h-full">
          <img
            src={player.avatar || ''}
            alt={`${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Player'}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className={`absolute inset-0 w-full h-full rounded-full bg-primary-600 dark:bg-primary-700 flex items-center justify-center text-white font-semibold ${sizeClasses.text}`}>
          {initials}
        </div>
      )}
      {role === 'OWNER' && (
        <div className={`absolute -top-1 -left-1 ${sizeClasses.crown} rounded-full bg-yellow-500 dark:bg-yellow-600 flex items-center justify-center border-2 border-white dark:border-gray-900`}>
          <Crown size={sizeClasses.crownIcon} className="text-white" />
        </div>
      )}
      {role === 'ADMIN' && (
        <div className={`absolute -top-1 -left-1 ${sizeClasses.crown} rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center border-2 border-white dark:border-gray-900`}>
          <Crown size={sizeClasses.crownIcon} className="text-white" />
        </div>
      )}
      {extrasmall && player.isTrainer && (
        <div className={`absolute -bottom-1 ${trainerBadgeLeftClass} ${levelBadgeClass} z-10 ${player.gender && player.gender !== 'PREFER_NOT_TO_SAY' ? (player.gender === 'MALE' ? 'bg-blue-500 dark:bg-blue-600' : 'bg-pink-500 dark:bg-pink-600') : 'bg-blue-500 dark:bg-blue-600'}`} style={levelBadgeStyle}>
          <Dumbbell size={8} className="text-white" />
        </div>
      )}
      {!extrasmall && !player.isTrainer && (
        <GenderIndicator
          gender={player.gender}
          layout={smallLayout ? 'small' : 'normal'}
          position="bottom-left"
          wrapperClassName={levelBadgeClass}
          wrapperStyle={levelBadgeStyle}
        />
      )}
      {!extrasmall && player.isTrainer && (
        <div
          className={`absolute -bottom-1 ${trainerBadgeLeftClass} ${levelBadgeClassNoSize} z-10 ${smallLayout ? 'h-5 px-1.5 min-w-[1.25rem]' : 'h-6 px-2 min-w-[1.5rem]'} ${player.gender && player.gender !== 'PREFER_NOT_TO_SAY' ? (player.gender === 'MALE' ? 'bg-blue-500 dark:bg-blue-600' : 'bg-pink-500 dark:bg-pink-600') : 'bg-blue-500 dark:bg-blue-600'}`}
          style={levelBadgeStyle}
        >
          <Dumbbell size={smallLayout ? 10 : 12} className="text-white" />
        </div>
      )}
      {appMode === 'PADEL' ? (
        <div className={`absolute -bottom-1 ${levelRightClass}`}>
          {(() => {
            const levelColor = getLevelColor(player.level, isDark);
            return player.approvedLevel ? (
              <div
                className={`relative ${extrasmall ? 'h-3.5 px-1' : smallLayout ? 'h-4 px-1.5 -mr-1' : 'h-5 px-1.5'} rounded-full flex items-center justify-center gap-1`}
                style={{ ...levelColor, ...levelBadgeStyle }}
              >
                <span className={`text-white font-bold leading-none ${extrasmall ? 'text-[8px]' : smallLayout ? 'text-[10px]' : 'text-xs'}`}>
                  {player.level.toFixed(1)}
                </span>
                <Check size={extrasmall ? 7 : smallLayout ? 9 : 12} className="text-white" strokeWidth={3} />
              </div>
            ) : (
              <div
                className={`relative ${levelBadgeClass}`}
                style={{ ...levelColor, ...levelBadgeStyle }}
              >
                {player.level.toFixed(1)}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="absolute -bottom-1 -right-1 flex flex-col items-center">
          <span className={`text-white font-bold text-center leading-none mb-0.5 ${extrasmall ? 'text-[8px]' : smallLayout ? 'text-[10px]' : 'text-xs'} bg-black bg-opacity-60 rounded px-1 py-0.5`}>
            {player.socialLevel.toFixed(1)}
          </span>
          <div className="relative">
            <Beer size={extrasmall ? 16 : smallLayout ? 20 : 24} className="text-amber-600 dark:text-amber-500 absolute inset-0" fill="currentColor" />
            <Beer size={extrasmall ? 16 : smallLayout ? 20 : 24} className="text-white dark:text-gray-900 relative z-10" strokeWidth={1.5} />
          </div>
        </div>
      )}
    </>
  );

  const wrapperClassName = `relative z-10 ${sizeClasses.avatar} rounded-full flex-shrink-0 p-0 border-0 ${!asDiv ? (draggable ? 'cursor-move' : 'cursor-pointer') + ' hover:opacity-80 transition-opacity ' : ''}${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : player.isTrainer ? 'ring-[3px] ring-green-500 dark:ring-green-400' : ''}${player && isOnline ? (isFavorite ? ' avatar-online-border-favorite' : player.isTrainer ? ' avatar-online-border-trainer' : ' avatar-online-border') : ''}`;

  return (
    <div className="flex flex-col items-center overflow-visible">
      <div className="relative overflow-visible">
        {isFavorite && (
          <div
            className={`absolute top-0 left-0 ${sizeClasses.avatar} rounded-full pointer-events-none z-0`}
            style={getGlowStyle()}
          />
        )}
        {asDiv ? (
          <div className={wrapperClassName}>
            {renderAvatarContent()}
          </div>
        ) : (
          <button
            ref={buttonRef}
            draggable={draggable}
            onDragStart={draggable ? onDragStart : undefined}
            onDragEnd={draggable ? onDragEnd : undefined}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!user) setShowAuthModal(true);
              else openPlayerCard(player.id);
            }}
            className={wrapperClassName}
          >
            {renderAvatarContent()}
          </button>
        )}
        {removable && onRemoveClick && (
          <button
            onClick={onRemoveClick}
            className={`absolute -top-1 -right-1 ${sizeClasses.remove} rounded-full bg-red-500 dark:bg-red-600 flex items-center justify-center hover:bg-red-600 dark:hover:bg-red-700 transition-colors border-2 border-white dark:border-gray-900 z-10`}
          >
            <X size={sizeClasses.removeIcon} className="text-white" />
          </button>
        )}
      </div>
      {!fullHideName && (
        <div className={`overflow-visible transition-all duration-300 ease-in-out ${
          showName ? 'max-h-20 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2'
        }`}>
          <div className={`${sizeClasses.name} text-gray-700 dark:text-gray-300 break-words text-center leading-tight flex flex-col items-center justify-start`}>
            {isCurrentUser ? (
              <span className={`${extrasmall ? 'max-w-20' : 'max-w-24'} truncate leading-none`}>
                {t('createGame.you')}
              </span>
            ) : (
              <>
                <span className={`text-center truncate leading-none ${extrasmall ? 'max-w-16' : 'max-w-20'}`}>
                  {player.firstName || ''}
                </span>
                <span className={`text-center truncate leading-none ${extrasmall ? 'max-w-16' : 'max-w-20'}`}>
                  {player.lastName || ''}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      <Dialog open={showAuthModal} onClose={() => setShowAuthModal(false)} modalId="player-avatar-auth-modal">
        <DialogContent>
          <PublicGamePrompt />
        </DialogContent>
      </Dialog>
    </div>
  );
};







