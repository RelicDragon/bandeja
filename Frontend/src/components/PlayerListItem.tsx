import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BasicUser } from '@/types';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayerListItemProps {
  player: BasicUser;
  isSelected: boolean;
  gamesTogetherCount: number;
  onSelect: () => void;
}

export function PlayerListItem({ player, isSelected, gamesTogetherCount, onSelect }: PlayerListItemProps) {
  const { t } = useTranslation();

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group flex items-center gap-3 rounded-2xl border px-3 py-2.5 cursor-pointer transition-all ${
        isSelected
          ? 'border-primary-300/70 bg-gradient-to-r from-primary-50 to-white shadow-md shadow-primary-500/10 ring-1 ring-primary-200/60 dark:border-primary-700/50 dark:from-primary-950/50 dark:to-gray-900 dark:ring-primary-800/40'
          : 'border-transparent bg-gray-50/50 hover:border-gray-200/80 hover:bg-white hover:shadow-sm dark:bg-gray-800/30 dark:hover:border-gray-700 dark:hover:bg-gray-800/60'
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex-shrink-0 ring-2 ring-white dark:ring-gray-900 rounded-full shadow-sm">
        <PlayerAvatar player={player} showName={false} fullHideName smallLayout={false} extrasmall />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {player.firstName} {player.lastName}
          </p>
          {player.gender && player.gender !== 'PREFER_NOT_TO_SAY' && (
            <span
              className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] ${
                player.gender === 'MALE' ? 'bg-sky-500 text-white' : 'bg-rose-500 text-white'
              }`}
            >
              <i className={`bi ${player.gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'}`} />
            </span>
          )}
          {gamesTogetherCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25">
              {t('playerInvite.gamesTogetherBadge', { count: gamesTogetherCount })}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
            {t('playerInvite.levelShort', { value: player.level?.toFixed(1) ?? '—' })}
          </span>
          <span className="inline-flex items-center rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:text-sky-200">
            {t('playerInvite.socialShort', { value: player.socialLevel?.toFixed(1) ?? '—' })}
          </span>
        </div>
        {player.verbalStatus && <p className="verbal-status mt-0.5">{player.verbalStatus}</p>}
      </div>
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          isSelected
            ? 'border-primary-600 bg-primary-600 dark:border-primary-500 dark:bg-primary-500'
            : 'border-gray-200 bg-white group-hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800'
        }`}
      >
        {isSelected && <Check size={15} className="text-white" strokeWidth={2.5} />}
      </div>
    </div>
  );
}
