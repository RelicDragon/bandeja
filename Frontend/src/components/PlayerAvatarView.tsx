import React from 'react';
import { Beer, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserStats } from '@/api/users';
import { GenderIndicator } from './GenderIndicator';
import { useFavoritesStore } from '@/store/favoritesStore';
import {
  getDisplayLevelForSport,
  getUserPrimarySport,
  resolveActivePrimarySport,
  shouldShowSportLevelBadge,
} from '@/utils/profileSports';
import { getSportConfig } from '@/sport/sportRegistry';

const glowNormal = '[box-shadow:0_0_10px_5px_rgba(45,158,245,0.4)]';
const glowFavorite = '[box-shadow:0_0_14px_7px_rgba(245,158,11,0.4)]';

interface PlayerAvatarViewProps {
  stats: UserStats;
  onBack?: () => void;
  onAvatarClick?: () => void;
}

export const PlayerAvatarView: React.FC<PlayerAvatarViewProps> = ({ stats, onAvatarClick }) => {
  const { t } = useTranslation();
  const { user } = stats;
  const levelSport = stats.sport ?? resolveActivePrimarySport(user) ?? getUserPrimarySport(user);
  const showCompetitive = shouldShowSportLevelBadge(user, levelSport);
  const isFavorite = useFavoritesStore((state) => state.isFavorite(user.id));
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const glow = isFavorite ? glowFavorite : glowNormal;

  return (
    <div className="flex flex-col items-center p-6 pt-0 gap-4">
      <div className="pt-4 relative shrink-0 w-full flex items-center justify-center">
        {user.originalAvatar ? (
          onAvatarClick ? (
            <button
              type="button"
              onClick={onAvatarClick}
              className="relative inline-block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'}
            >
              <img
                src={user.originalAvatar}
                alt=""
                aria-hidden
                className={`max-w-full max-h-[50vh] w-auto h-auto object-contain rounded-2xl p-1 cursor-pointer ${glow}`}
              />
              <span
                className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm pointer-events-none"
                aria-hidden
              >
                <Maximize2 size={16} strokeWidth={2.25} />
              </span>
            </button>
          ) : (
            <img
              src={user.originalAvatar}
              alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'}
              className={`max-w-full max-h-[50vh] w-auto h-auto object-contain rounded-2xl p-1 ${glow}`}
            />
          )
        ) : (
          <div className={`w-64 h-64 max-w-full aspect-square bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 flex items-center justify-center text-white font-bold text-6xl border-8 border-white dark:border-gray-800 rounded-2xl ${glow}`}>
            {initials}
          </div>
        )}
        <GenderIndicator gender={user.gender} layout="big" position="bottom-right" />
      </div>

      <div className="text-center flex gap-3 justify-center shrink-0 flex-wrap">
        {showCompetitive && (
          <div className="inline-block bg-yellow-500 dark:bg-yellow-600 text-white px-4 py-2 rounded-full font-bold text-base shadow-lg">
            {t(getSportConfig(levelSport).labelKey)} {getDisplayLevelForSport(user, levelSport).toFixed(1)}
          </div>
        )}
        <div className="inline-block bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 rounded-full font-bold text-base shadow-lg flex items-center gap-2">
          {t('rating.socialLevel')}
          <div className="relative flex items-center">
            <Beer
              size={16}
              className="text-amber-600 dark:text-amber-500 absolute"
              fill="currentColor"
            />
            <Beer
              size={16}
              className="text-white dark:text-gray-900 relative z-10"
              strokeWidth={1.5}
            />
          </div>
          {user.socialLevel.toFixed(1)}
        </div>
      </div>
    </div>
  );
};
