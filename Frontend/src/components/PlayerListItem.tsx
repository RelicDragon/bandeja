import { Check, CalendarClock, CalendarX2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BasicUser } from '@/types';
import { PlayerAvatar } from './PlayerAvatar';
import { formatInviteStatsRows } from '@/components/playerInvite/formatInviteStatsLine';
import type { GameAvailabilityMatch } from '@/utils/availability/gameMatch';

interface PlayerListItemProps {
  player: BasicUser;
  isSelected: boolean;
  gamesTogetherCount: number;
  onSelect: () => void;
  availability?: GameAvailabilityMatch;
}

export function PlayerListItem({ player, isSelected, gamesTogetherCount, onSelect, availability }: PlayerListItemProps) {
  const { t } = useTranslation();
  const { levelRow, socialRow } = formatInviteStatsRows(t, player.level, player.socialLevel, player.reliability);

  const dim = availability === 'none' || availability === 'partial';
  const availabilityLabel =
    availability === 'none'
      ? t('playerInvite.availabilityNone')
      : availability === 'partial'
        ? t('playerInvite.availabilityPartial')
        : null;
  const availabilityTone =
    availability === 'none'
      ? 'text-rose-500/90 dark:text-rose-400/90'
      : 'text-amber-500 dark:text-amber-400';
  const AvailabilityIcon = availability === 'none' ? CalendarX2 : CalendarClock;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
      className={`flex items-center gap-3 rounded-xl px-2 py-2.5 cursor-pointer select-none transition-colors duration-150 ${
        isSelected
          ? 'bg-sky-500/15 dark:bg-sky-500/20'
          : 'hover:bg-gray-100 dark:hover:bg-white/5'
      } ${dim && !isSelected ? 'opacity-60' : ''}`}
    >
      <PlayerAvatar player={player} showName={false} fullHideName smallLayout={false} extrasmall />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {player.firstName} {player.lastName}
          {player.gender && player.gender !== 'PREFER_NOT_TO_SAY' && (
            <i className={`bi ml-1.5 text-[11px] ${player.gender === 'MALE' ? 'bi-gender-male text-sky-500' : 'bi-gender-female text-rose-400'}`} />
          )}
        </p>
        {player.verbalStatus && <p className="verbal-status mt-0.5">{player.verbalStatus}</p>}
        <div className="mt-0.5 space-y-0.5 text-[11px] text-gray-400 dark:text-gray-500">
          <p>{levelRow}</p>
          <p>
            {socialRow}
            {gamesTogetherCount > 0 && (
              <>
                <span className="mx-1">·</span>
                <span className="text-emerald-500 dark:text-emerald-400">
                  {t('playerInvite.gamesTogetherBadge', { count: gamesTogetherCount })}
                </span>
              </>
            )}
          </p>
          {availabilityLabel && (
            <p className={`flex items-center gap-1 ${availabilityTone}`}>
              <AvailabilityIcon size={11} />
              <span>{availabilityLabel}</span>
            </p>
          )}
        </div>
      </div>

      <div className={`flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-150 ${
        isSelected
          ? 'bg-sky-500 dark:bg-sky-400'
          : 'border-2 border-gray-300 dark:border-gray-600'
      }`}>
        {isSelected && <Check size={11} className="text-white dark:text-gray-900" strokeWidth={3.5} />}
      </div>
    </div>
  );
}
