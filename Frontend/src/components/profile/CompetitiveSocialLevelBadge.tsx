import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Sport, User } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { SocialLevelIcon } from '@/components/profile/SocialLevelIcon';
import {
  getDisplayLevelForSport,
  hasMultipleSportsEnabled,
  shouldShowSportLevelBadge,
} from '@/utils/profileSports';

type CompetitiveSocialLevelBadgeProps = {
  user: User;
  sport: Sport;
  showSportLabel?: boolean;
  showApprovedCheck?: boolean;
  showReliability?: boolean;
  className?: string;
  levelDecimals?: number;
};

export function CompetitiveSocialLevelBadge({
  user,
  sport,
  showSportLabel = false,
  showApprovedCheck = false,
  showReliability = false,
  className = 'bg-yellow-500 dark:bg-yellow-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-1 inline-flex',
  levelDecimals = 1,
}: CompetitiveSocialLevelBadgeProps) {
  const { t } = useTranslation();
  const showCompetitive = shouldShowSportLevelBadge(user, sport);
  const levelText = getDisplayLevelForSport(user, sport).toFixed(levelDecimals);

  return (
    <span className={className}>
      {showCompetitive && (
        <>
          {showApprovedCheck && user.approvedLevel && (
            <Check size={14} className="text-white" strokeWidth={3} />
          )}
          {showSportLabel && hasMultipleSportsEnabled(user) && (
            <span className="text-[10px] font-medium opacity-90">
              {t(getSportConfig(sport).labelKey)}
            </span>
          )}
          <span>{levelText}</span>
          {showReliability && (
            <span className="text-[10px] font-normal opacity-90">
              {(user.reliability ?? 0).toFixed(0)}%
            </span>
          )}
          <span>•</span>
        </>
      )}
      <SocialLevelIcon size={14} foregroundClassName="text-white dark:text-gray-900" />
      <span>{user.socialLevel.toFixed(levelDecimals)}</span>
    </span>
  );
}
