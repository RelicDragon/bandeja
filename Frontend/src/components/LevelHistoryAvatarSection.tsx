import { Beer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { User } from '@/types';

const TennisBallIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 69.447 69.447"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g transform="translate(-1271.769 -1574.648)">
      <path d="M1341.208,1609.372a34.719,34.719,0,1,1-34.72-34.724A34.724,34.724,0,0,1,1341.208,1609.372Z" fill="#b9d613"/>
      <path d="M1311.144,1574.993a35.139,35.139,0,0,0-4.61-.344,41.069,41.069,0,0,1-34.369,29.735,34.3,34.3,0,0,0-.381,4.635l.183-.026a45.921,45.921,0,0,0,39.149-33.881Zm29.721,34.692a45.487,45.487,0,0,0-33.488,34.054l-.071.313a34.54,34.54,0,0,0,4.818-.455,41.218,41.218,0,0,1,28.686-29.194,36.059,36.059,0,0,0,.388-4.8Z" fill="#f7f7f7"/>
    </g>
  </svg>
);

export interface LevelHistoryAvatarSectionProps {
  user: User;
  showSocialLevel: boolean;
  onToggle: () => void;
  isToggleAnimating: boolean;
}

export const LevelHistoryAvatarSection = ({ user, showSocialLevel, onToggle, isToggleAnimating }: LevelHistoryAvatarSectionProps) => {
  const { t } = useTranslation();
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();

  return (
    <>
      <div className="relative">
        <div className="bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 rounded-2xl p-4 text-center relative">
          <div className="flex gap-2 items-center">
            {user.originalAvatar ? (
              <button className="cursor-pointer hover:opacity-90 transition-opacity">
                {user.avatar ? (
                  <img
                    src={user.avatar || ''}
                    alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-xl">
                    {initials}
                  </div>
                )}
              </button>
            ) : user.avatar ? (
              <img
                src={user.avatar || ''}
                alt={`${user.firstName} ${user.lastName}`}
                className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-xl">
                {initials}
              </div>
            )}

            <div className="flex flex-col text-left">
              <div className="text-white text-sm">
                {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}
              </div>
              <div className="text-white text-6xl font-bold pb-6">
                {showSocialLevel ? user.socialLevel.toFixed(2) : user.level.toFixed(2)}
              </div>
            </div>
          </div>
          {!showSocialLevel && (
            <div className="absolute bottom-3 right-3 text-white/80 text-xs">
              {t('rating.reliability')}: {user.reliability.toFixed(0)}%
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="absolute top-3 right-3 w-8 h-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-md hover:shadow-lg transition-transform duration-200 flex items-center justify-center"
          style={{ transform: isToggleAnimating ? 'scale(1.3)' : 'scale(1)' }}
          title={showSocialLevel ? t('playerCard.switchToLevel') : t('playerCard.switchToSocialLevel')}
        >
          {showSocialLevel ? (
            <TennisBallIcon />
          ) : (
            <Beer size={20} className="text-amber-600" />
          )}
        </button>
      </div>
    </>
  );
};
