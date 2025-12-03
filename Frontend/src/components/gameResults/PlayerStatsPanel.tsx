import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Game } from '@/types';
import { Round } from '@/types/gameResults';
import { calculateGameStandings } from '@/services/gameStandings';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface PlayerStatsPanelProps {
  game: Game;
  rounds: Round[];
}

export const PlayerStatsPanel = ({ game, rounds }: PlayerStatsPanelProps) => {
  const { t } = useTranslation();

  const standings = useMemo(() => {
    if (!game) {
      return [];
    }
    return calculateGameStandings(game, rounds, game.winnerOfGame || 'BY_MATCHES_WON');
  }, [game, rounds]);

  if (standings.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-gray-500 dark:text-gray-400">
        <p>{t('gameResults.noStatsAvailable') || 'No statistics available yet'}</p>
      </div>
    );
  }

  const isPointsBased = game.winnerOfGame === 'BY_POINTS';
  const gridCols = isPointsBased ? 'grid-cols-[auto_auto_1fr_1fr_1fr_1fr]' : 'grid-cols-[auto_auto_1fr_1fr_1fr]';

  const columns = [
    {
      key: 'rank',
      header: '',
      className: 'text-center'
    },
    {
      key: 'avatar',
      header: '',
      className: ''
    },
    {
      key: 'player',
      header: t('gameResults.player') || 'Player',
      className: ''
    },
    {
      key: 'winsTiesLosses',
      header: t('gameResults.winsTiesLosses') || 'W-T-L',
      className: 'text-center'
    },
    {
      key: 'scores',
      header: t('gameResults.scores') || 'Scores',
      className: 'text-center'
    },
    ...(isPointsBased ? [{
      key: 'points',
      header: t('gameResults.points') || 'Points',
      className: 'text-center'
    }] : [])
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className={`grid ${gridCols} gap-2 items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900`}>
        {columns.map((column) => (
          <div
            key={column.key}
            className={`text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase ${column.className}`}
          >
            {column.header}
          </div>
        ))}
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {standings.map((standing) => (
          <div
            key={standing.user.id}
            className={`grid ${gridCols} gap-4 items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50`}
          >
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 text-center">
              {standing.place}
            </div>
            <div>
              <PlayerAvatar player={standing.user} extrasmall showName={false} fullHideName={true} />
            </div>
            <div className="text-sm font-small text-gray-900 dark:text-gray-100 break-words line-clamp-2">
              {[standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ') || '-'}
            </div>
            <div className="text-center text-sm font-medium text-gray-900 dark:text-gray-100">
              {standing.wins}-{standing.ties}-{standing.losses}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {standing.scoresMade} - {standing.scoresLost}
              </span>
              {standing.scoresDelta !== 0 ? (
                <span className={`flex items-center gap-0.5 text-xs ${
                  standing.scoresDelta > 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  <span> {Math.abs(standing.scoresDelta)}</span>
                </span>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400">0</span>
              )}
            </div>
            {isPointsBased && (
              <div className="text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                {standing.points}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
