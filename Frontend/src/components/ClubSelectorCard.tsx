import { Navigation, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClubAvatar } from '@/components/ClubAvatar';

export interface ClubSelectorCardClub {
  id: string;
  name: string;
  avatar?: string | null;
  address?: string | null;
}

interface ClubSelectorCardProps {
  club: ClubSelectorCardClub;
  subtitle?: string | null;
  isSelected: boolean;
  isNearest?: boolean;
  onSelect: () => void;
  onInfoClick?: (e: React.MouseEvent) => void;
  showInfoButton?: boolean;
  className?: string;
}

export function ClubSelectorCard({
  club,
  subtitle,
  isSelected,
  isNearest = false,
  onSelect,
  onInfoClick,
  showInfoButton = true,
  className = '',
}: ClubSelectorCardProps) {
  const { t } = useTranslation();
  const secondaryLine = club.address?.trim() || subtitle?.trim() || null;

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-lg transition-all ${
        isSelected
          ? 'bg-primary-500 text-white'
          : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white'
      } ${className}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={isNearest ? `${club.name}, ${t('city.nearestToYou')}` : undefined}
        className={`flex-1 min-w-0 text-left flex items-stretch rounded-lg ${
          isSelected ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-700/80'
        }`}
      >
        <div
          className={`relative w-[4.125rem] shrink-0 self-stretch ${
            isSelected ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <ClubAvatar
            club={club}
            variant="tile"
            className={isSelected ? 'ring-2 ring-inset ring-white/40' : ''}
          />
        </div>
        <div className="min-w-0 flex-1 py-3 pr-3 pl-3 flex flex-col justify-center">
          <div className="flex items-center gap-2 min-w-0">
            {isNearest && (
              <span
                className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400'
                }`}
                title={t('city.nearestToYou')}
              >
                <Navigation className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
              </span>
            )}
            <div className="font-medium truncate min-w-0">{club.name}</div>
          </div>
          {secondaryLine ? (
            <div className={`text-sm mt-0.5 truncate ${isSelected ? 'opacity-90' : 'opacity-80'}`}>
              {secondaryLine}
            </div>
          ) : null}
        </div>
      </button>
      {showInfoButton && onInfoClick ? (
        <button
          type="button"
          onClick={onInfoClick}
          className={`shrink-0 px-3 flex items-center justify-center rounded-r-lg border-l ${
            isSelected
              ? 'border-white/20 text-white hover:bg-white/10'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          aria-label={t('createGame.clubInfo')}
        >
          <Info size={20} />
        </button>
      ) : null}
    </div>
  );
}
