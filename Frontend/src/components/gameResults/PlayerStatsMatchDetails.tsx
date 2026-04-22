import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayerMatchDetail } from './playerStatsDetails';

interface PlayerStatsMatchDetailsProps {
  detail: PlayerMatchDetail;
}

function renderTeamNames(
  ids: string[],
  names: string[],
  statsPlayerId: string,
  label: string
) {
  return (
    <div className="text-[11px] text-gray-600 dark:text-gray-300">
      <span className="font-medium">{label}</span>{' '}
      {ids.map((id, i) => (
        <Fragment key={`${id}-${i}`}>
          {i > 0 ? ' / ' : null}
          <span className={id === statsPlayerId ? 'font-bold text-gray-900 dark:text-gray-100' : undefined}>
            {names[i] ?? ''}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export const PlayerStatsMatchDetails = ({ detail }: PlayerStatsMatchDetailsProps) => {
  const { t } = useTranslation();

  return (
    <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 p-2">
      {renderTeamNames(detail.teamAPlayerIds, detail.teamAPlayers, detail.statsPlayerId, 'A:')}
      <div className="mt-0.5">
        {renderTeamNames(detail.teamBPlayerIds, detail.teamBPlayers, detail.statsPlayerId, 'B:')}
      </div>
      <div className="mt-2 space-y-1">
        {detail.sets.map((set, idx) => (
          <div key={`${detail.matchId}-set-${idx}`} className="text-[11px] text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t('gameResults.set') || 'Set'} {idx + 1}:</span>{' '}
            {set.myScore}-{set.oppScore}
            {set.isTieBreak ? ' TB' : ''}
          </div>
        ))}
      </div>
    </div>
  );
};
