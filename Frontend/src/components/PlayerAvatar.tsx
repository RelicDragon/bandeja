import { X, User, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { User as UserType } from '@/types';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { useRef, useEffect } from 'react';
import { CachedImage } from './CachedImage';
import { UrlConstructor } from '@/utils/urlConstructor';
import { GenderIndicator } from './GenderIndicator';
import 'bootstrap-icons/font/bootstrap-icons.css';

interface PlayerAvatarProps {
  player?: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level?: number;
    gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  } | UserType | null;
  isCurrentUser?: boolean;
  onRemoveClick?: () => void;
  removable?: boolean;
  showName?: boolean;
  draggable?: boolean;
  smallLayout?: boolean;
  extrasmall?: boolean;
  role?: 'OWNER' | 'ADMIN' | 'PLAYER';
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onTouchStart?: (e: TouchEvent) => void;
  onTouchMove?: (e: TouchEvent) => void;
  onTouchEnd?: (e: TouchEvent) => void;
}

export const PlayerAvatar = ({ player, isCurrentUser, onRemoveClick, removable, showName = true, draggable = false, smallLayout = false, extrasmall = false, role, onDragStart, onDragEnd, onTouchStart, onTouchMove, onTouchEnd }: PlayerAvatarProps) => {
  const { t } = useTranslation();
  const { openPlayerCard } = usePlayerCardModal();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const getSizeClasses = () => {
    if (extrasmall) return { avatar: 'w-8 h-8', text: 'text-xs', name: 'mt-0.5 text-[10px] h-8 max-w-12 leading-tight', level: 'w-4 h-4 text-[8px]', crown: 'w-4 h-4', crownIcon: 8, remove: 'w-4 h-4', removeIcon: 8 };
    if (smallLayout) return { avatar: 'w-12 h-12', text: 'text-sm', name: 'mt-1 text-xs h-8', level: 'w-5 h-5 text-[10px]', crown: 'w-5 h-5', crownIcon: 10, remove: 'w-5 h-5', removeIcon: 10 };
    return { avatar: 'w-16 h-16', text: 'text-lg', name: 'mt-2 text-sm h-10', level: 'w-7 h-7 text-xs font-bold border-2', crown: 'w-6 h-6', crownIcon: 12, remove: 'w-6 h-6', removeIcon: 14 };
  };

  const sizeClasses = getSizeClasses();

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

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <button
          ref={buttonRef}
          draggable={draggable}
          onDragStart={draggable ? onDragStart : undefined}
          onDragEnd={draggable ? onDragEnd : undefined}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openPlayerCard(player.id);
          }}
          className={`${draggable ? 'cursor-move' : 'cursor-pointer'} hover:opacity-80 transition-opacity`}
        >
          {player.avatar ? (
            <CachedImage
              src={UrlConstructor.constructImageUrl(player.avatar)}
              alt={`${player.firstName} ${player.lastName}`}
              className={`${sizeClasses.avatar} rounded-full object-cover`}
              showLoadingSpinner={true}
              loadingClassName="rounded-full"
            />
          ) : (
            <div className={`${sizeClasses.avatar} rounded-full bg-primary-600 dark:bg-primary-700 flex items-center justify-center text-white font-semibold ${sizeClasses.text}`}>
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
          {!extrasmall && <GenderIndicator gender={player.gender} layout={smallLayout ? 'small' : 'normal'} position="bottom-left" />}
          <div className={`absolute -bottom-1 -right-1 ${sizeClasses.level} rounded-full bg-yellow-500 dark:bg-yellow-600 flex items-center justify-center text-white ${sizeClasses.level.includes('w-4') ? 'text-[8px]' : sizeClasses.level.includes('w-5') ? 'text-[10px]' : 'text-xs font-bold border-2'} border-white dark:border-gray-900`}>
            {player.level?.toFixed(1) || '0.0'}
          </div>
        </button>
        {removable && onRemoveClick && (
          <button
            onClick={onRemoveClick}
            className={`absolute -top-1 -right-1 ${sizeClasses.remove} rounded-full bg-red-500 dark:bg-red-600 flex items-center justify-center hover:bg-red-600 dark:hover:bg-red-700 transition-colors border-2 border-white dark:border-gray-900 z-10`}
          >
            <X size={sizeClasses.removeIcon} className="text-white" />
          </button>
        )}
      </div>
      {showName && (
        <div className={`${sizeClasses.name} text-gray-700 dark:text-gray-300 break-words text-center leading-tight flex flex-col items-center justify-center`}>
          {extrasmall && !isCurrentUser ? (
            <>
              <span className="text-center">{player.firstName}</span>
              <span className="text-center">{player.lastName}</span>
            </>
          ) : (
            <span className={`${extrasmall ? 'max-w-12' : 'max-w-20'}`}>
              {isCurrentUser ? t('createGame.you') : [player.firstName, player.lastName].filter(name => name && name.trim()).join(' ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};







