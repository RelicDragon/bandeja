import { X, User, Crown, Beer, Check, Dumbbell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BasicUser } from '@/types';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { useRef, useEffect, useState } from 'react';
import { GenderIndicator } from './GenderIndicator';
import { useAppModeStore } from '@/store/appModeStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useAuthStore } from '@/store/authStore';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { PublicGamePrompt } from './GameDetails/PublicGamePrompt';
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
  const { t } = useTranslation();
  const { openPlayerCard } = usePlayerCardModal();
  const { mode: appMode } = useAppModeStore();
  const isFavorite = useFavoritesStore((state) => player ? state.isFavorite(player.id) : false);
  const user = useAuthStore((state) => state.user);
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
    if (extrasmall) return { avatar: 'w-8 h-8', text: 'text-xs', name: 'mt-0.5 text-[10px] h-8 leading-tight', level: 'w-4 h-4 text-[8px]', crown: 'w-4 h-4', crownIcon: 8, remove: 'w-4 h-4', removeIcon: 8 };
    if (smallLayout) return { avatar: 'w-12 h-12', text: 'text-sm', name: 'mt-1 text-xs h-8 w-full', level: 'w-5 h-5 text-[10px]', crown: 'w-5 h-5', crownIcon: 10, remove: 'w-5 h-5', removeIcon: 10 };
    return { avatar: 'w-16 h-16', text: 'text-lg', name: 'mt-2 text-sm h-10', level: 'w-7 h-7 text-xs font-bold border-2', crown: 'w-6 h-6', crownIcon: 12, remove: 'w-6 h-6', removeIcon: 14 };
  };

  const sizeClasses = getSizeClasses();

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

  const interpolateColor = (start: [number, number, number], end: [number, number, number], t: number): [number, number, number] => {
    return [
      Math.round(start[0] + (end[0] - start[0]) * t),
      Math.round(start[1] + (end[1] - start[1]) * t),
      Math.round(start[2] + (end[2] - start[2]) * t),
    ];
  };

  const getLevelColor = (level: number, isDark: boolean = false): { backgroundColor: string } => {
    const levelValue = Math.max(0, Math.min(7, level));
    
    const colorStops: Array<{ level: number; rgb: [number, number, number] }> = [
      { level: 0, rgb: [59, 130, 246] },   // blue-500
      { level: 2, rgb: [34, 197, 94] },    // green-500
      { level: 3, rgb: [234, 179, 8] },    // yellow-500
      { level: 4, rgb: [249, 115, 22] },  // orange-500
      { level: 5, rgb: [239, 68, 68] },    // red-500
      { level: 6, rgb: [245, 158, 11] },   // amber-500
      { level: 7, rgb: [168, 85, 247] },   // purple-500
    ];

    const darkMultiplier = isDark ? 0.85 : 1;

    if (levelValue <= colorStops[0].level) {
      const [r, g, b] = colorStops[0].rgb;
      return { backgroundColor: `rgb(${Math.round(r * darkMultiplier)}, ${Math.round(g * darkMultiplier)}, ${Math.round(b * darkMultiplier)})` };
    }

    if (levelValue >= colorStops[colorStops.length - 1].level) {
      const [r, g, b] = colorStops[colorStops.length - 1].rgb;
      return { backgroundColor: `rgb(${Math.round(r * darkMultiplier)}, ${Math.round(g * darkMultiplier)}, ${Math.round(b * darkMultiplier)})` };
    }

    for (let i = 0; i < colorStops.length - 1; i++) {
      const currentStop = colorStops[i];
      const nextStop = colorStops[i + 1];

      if (levelValue >= currentStop.level && levelValue <= nextStop.level) {
        const t = (levelValue - currentStop.level) / (nextStop.level - currentStop.level);
        const [r, g, b] = interpolateColor(currentStop.rgb, nextStop.rgb, t);
        return { backgroundColor: `rgb(${Math.round(r * darkMultiplier)}, ${Math.round(g * darkMultiplier)}, ${Math.round(b * darkMultiplier)})` };
      }
    }

    const [r, g, b] = colorStops[0].rgb;
    return { backgroundColor: `rgb(${Math.round(r * darkMultiplier)}, ${Math.round(g * darkMultiplier)}, ${Math.round(b * darkMultiplier)})` };
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
          <div
            className={`relative z-10 ${sizeClasses.avatar} rounded-full flex-shrink-0 p-0 border-0 ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}
          >
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
            <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center border-2 border-white dark:border-gray-900 z-10">
              <Dumbbell size={8} className="text-white" />
            </div>
          )}
          {!extrasmall && !player.isTrainer && <GenderIndicator gender={player.gender} layout={smallLayout ? 'small' : 'normal'} position="bottom-left" />}
          {!extrasmall && player.isTrainer && (
            <div className={`absolute -bottom-1 -left-1 rounded-full flex items-center justify-center gap-0.5 border-2 border-white dark:border-gray-900 z-10 ${smallLayout ? 'h-5 px-1.5 min-w-[1.25rem]' : 'h-6 px-2 min-w-[1.5rem]'} ${player.gender && player.gender !== 'PREFER_NOT_TO_SAY' ? (player.gender === 'MALE' ? 'bg-blue-500 dark:bg-blue-600' : 'bg-pink-500 dark:bg-pink-600') : 'bg-blue-500 dark:bg-blue-600'}`}>
              {player.gender && player.gender !== 'PREFER_NOT_TO_SAY' && (
                <i className={`bi ${player.gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'} text-white ${smallLayout ? 'text-[10px]' : 'text-xs'}`}></i>
              )}
              <Dumbbell size={smallLayout ? 10 : 12} className="text-white" />
            </div>
          )}
          {appMode === 'PADEL' ? (
            <div className="absolute -bottom-1 -right-2">
              {player.approvedLevel ? (
                <div 
                  className={`relative ${extrasmall ? 'h-3.5 px-1' : smallLayout ? 'h-4 px-1.5 -mr-1' : 'h-5 px-1.5'} rounded-full flex items-center justify-center gap-1 shadow-lg ring-4 ring-blue-300 dark:ring-blue-500 ring-offset-white dark:ring-offset-gray-900 ring-offset-1`}
                  style={{
                    ...getLevelColor(player.level, isDark),
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4), 0 2px 4px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
                >
                  <span 
                    className={`text-white font-bold leading-none ${extrasmall ? 'text-[8px]' : smallLayout ? 'text-[10px]' : 'text-xs'}`}
                  >
                    {player.level.toFixed(1)}
                  </span>
                  <Check 
                    size={extrasmall ? 7 : smallLayout ? 9 : 12} 
                    className="text-white" 
                    strokeWidth={3}
                  />
                </div>
              ) : (
                <div 
                  className={`relative ${sizeClasses.level} rounded-full flex items-center justify-center text-white ${sizeClasses.level.includes('w-4') ? 'text-[8px]' : sizeClasses.level.includes('w-5') ? 'text-[10px]' : 'text-xs font-bold border-2'} border-white dark:border-gray-900`}
                  style={{
                    ...getLevelColor(player.level, isDark),
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
                >
                  {player.level.toFixed(1)}
                </div>
              )}
            </div>
          ) : (
            <div className="absolute -bottom-1 -right-1 flex flex-col items-center">
              <span className={`text-white font-bold text-center leading-none mb-0.5 ${
                extrasmall ? 'text-[8px]' : smallLayout ? 'text-[10px]' : 'text-xs'
              } bg-black bg-opacity-60 rounded px-1 py-0.5`}>
                {player.socialLevel.toFixed(1)}
              </span>
              <div className="relative">
                <Beer
                  size={extrasmall ? 16 : smallLayout ? 20 : 24}
                  className="text-amber-600 dark:text-amber-500 absolute inset-0"
                  fill="currentColor"
                />
                <Beer
                  size={extrasmall ? 16 : smallLayout ? 20 : 24}
                  className="text-white dark:text-gray-900 relative z-10"
                  strokeWidth={1.5}
                />
              </div>
            </div>
          )}
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
              if (!user) {
                setShowAuthModal(true);
              } else {
                openPlayerCard(player.id);
              }
            }}
            className={`relative z-10 ${sizeClasses.avatar} rounded-full ${draggable ? 'cursor-move' : 'cursor-pointer'} hover:opacity-80 transition-opacity flex-shrink-0 p-0 border-0 ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}
          >
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
            <div className="absolute -bottom-1 -left-1.5 w-4 h-4 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center border-2 border-white dark:border-gray-900 z-10">
              <Dumbbell size={8} className="text-white" />
            </div>
          )}
          {!extrasmall && !player.isTrainer && <GenderIndicator gender={player.gender} layout={smallLayout ? 'small' : 'normal'} position="bottom-left" />}
          {!extrasmall && player.isTrainer && (
            <div className={`absolute -bottom-1 -left-2 rounded-full flex items-center justify-center gap-0.5 border-2 border-white dark:border-gray-900 z-10 ${smallLayout ? 'h-5 px-1.5 min-w-[1.25rem]' : 'h-6 px-2 min-w-[1.5rem]'} ${player.gender && player.gender !== 'PREFER_NOT_TO_SAY' ? (player.gender === 'MALE' ? 'bg-blue-500 dark:bg-blue-600' : 'bg-pink-500 dark:bg-pink-600') : 'bg-blue-500 dark:bg-blue-600'}`}>
              {player.gender && player.gender !== 'PREFER_NOT_TO_SAY' && (
                <i className={`bi ${player.gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'} text-white ${smallLayout ? 'text-[10px]' : 'text-xs'}`}></i>
              )}
              <Dumbbell size={smallLayout ? 10 : 12} className="text-white" />
            </div>
          )}
          {appMode === 'PADEL' ? (
            <div className="absolute -bottom-1 -right-3">
              {player.approvedLevel ? (
                <div 
                  className={`relative ${extrasmall ? 'h-3.5 px-1' : smallLayout ? 'h-4 px-1.5 -mr-1' : 'h-5 px-1.5'} rounded-full flex items-center justify-center gap-1 shadow-lg ring-4 ring-blue-300 dark:ring-blue-500 ring-offset-white dark:ring-offset-gray-900 ring-offset-1`}
                  style={{
                    ...getLevelColor(player.level, isDark),
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4), 0 2px 4px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
                >
                  <span 
                    className={`text-white font-bold leading-none ${extrasmall ? 'text-[8px]' : smallLayout ? 'text-[10px]' : 'text-xs'}`}
                  >
                    {player.level.toFixed(1)}
                  </span>
                  <Check 
                    size={extrasmall ? 7 : smallLayout ? 9 : 12} 
                    className="text-white" 
                    strokeWidth={3}
                  />
                </div>
              ) : (
                <div 
                  className={`relative ${sizeClasses.level} rounded-full flex items-center justify-center text-white ${sizeClasses.level.includes('w-4') ? 'text-[8px]' : sizeClasses.level.includes('w-5') ? 'text-[10px]' : 'text-xs font-bold border-2'} border-white dark:border-gray-900`}
                  style={{
                    ...getLevelColor(player.level, isDark),
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
                >
                  {player.level.toFixed(1)}
                </div>
              )}
            </div>
          ) : (
            <div className="absolute -bottom-1 -right-1 flex flex-col items-center">
              <span className={`text-white font-bold text-center leading-none mb-0.5 ${
                extrasmall ? 'text-[8px]' : smallLayout ? 'text-[10px]' : 'text-xs'
              } bg-black bg-opacity-60 rounded px-1 py-0.5`}>
                {player.socialLevel.toFixed(1)}
              </span>
              <div className="relative">
                <Beer
                  size={extrasmall ? 16 : smallLayout ? 20 : 24}
                  className="text-amber-600 dark:text-amber-500 absolute inset-0"
                  fill="currentColor"
                />
                <Beer
                  size={extrasmall ? 16 : smallLayout ? 20 : 24}
                  className="text-white dark:text-gray-900 relative z-10"
                  strokeWidth={1.5}
                />
              </div>
            </div>
          )}
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







