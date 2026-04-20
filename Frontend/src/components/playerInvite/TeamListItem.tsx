import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser, UserTeam } from '@/types';
import { TeamAvatar } from '@/components/TeamAvatar';
import {
  teamAverageLevel,
  teamAverageReliability,
  teamAverageSocial,
} from '@/components/playerInvite/inviteEntries';
import { formatInviteStatsRows } from '@/components/playerInvite/formatInviteStatsLine';

interface TeamListItemProps {
  team: UserTeam;
  members: BasicUser[];
  isSelected: boolean;
  gamesTogetherCount: number;
  onSelect: () => void;
}

export function TeamListItem({ team, members, isSelected, gamesTogetherCount, onSelect }: TeamListItemProps) {
  const { t } = useTranslation();
  const label = members.map((m) => m.firstName || '').filter(Boolean).join(' · ') || team.name;
  const teamVerbal = team.verbalStatus?.trim() || '';
  const { levelRow, socialRow } = useMemo(() => {
    const lvl = teamAverageLevel(team);
    const soc = teamAverageSocial(team);
    const rel = teamAverageReliability(team);
    return formatInviteStatsRows(t, lvl, soc, rel);
  }, [team, t]);

  return (
    <div
      tabIndex={0}
      aria-label={`${team.name}. ${label}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex items-center gap-3 rounded-xl px-2 py-2.5 cursor-pointer select-none transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
        isSelected
          ? 'bg-sky-500/20 ring-1 ring-sky-400/35 dark:bg-sky-500/25 dark:ring-sky-400/25'
          : 'bg-indigo-50/90 hover:bg-indigo-100/90 dark:bg-indigo-950/45 dark:hover:bg-indigo-950/65'
      }`}
    >
      <TeamAvatar team={team} size="tile" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{team.name}</p>
        {teamVerbal ? <p className="verbal-status mt-0.5">{teamVerbal}</p> : null}
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 truncate">{label}</p>
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
        </div>
      </div>

      <div
        className={`flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-150 ${
          isSelected ? 'bg-sky-500 dark:bg-sky-400' : 'border-2 border-gray-300 dark:border-gray-600'
        }`}
      >
        {isSelected && <Check size={11} className="text-white dark:text-gray-900" strokeWidth={3.5} />}
      </div>
    </div>
  );
}
