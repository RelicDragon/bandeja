import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Game, GameOutcome } from '@/types';
import { Round } from '@/types/gameResults';
import { calculateGameStandings, PlayerStanding } from '@/services/gameStandings';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface PlayerStatsPanelProps {
  game: Game;
  rounds: Round[];
}

function standingsFromOutcomes(outcomes: GameOutcome[], isPointsBased: boolean): PlayerStanding[] {
  const sorted = [...outcomes].sort((a, b) => {
    if (a.position != null && b.position != null) return a.position - b.position;
    if (a.position != null && b.position == null) return -1;
    if (a.position == null && b.position != null) return 1;
    return b.pointsEarned - a.pointsEarned;
  });
  return sorted.map((outcome, index) => ({
    user: outcome.user,
    place: outcome.position ?? index + 1,
    wins: outcome.wins,
    ties: outcome.ties,
    losses: outcome.losses,
    scoresMade: outcome.scoresMade,
    scoresLost: outcome.scoresLost,
    points: isPointsBased ? outcome.pointsEarned : 0,
    roundsWon: 0,
    matchesWon: outcome.wins,
    scoresDelta: outcome.scoresMade - outcome.scoresLost,
  }));
}

export const PlayerStatsPanel = ({ game, rounds }: PlayerStatsPanelProps) => {
  const { t } = useTranslation();

  const isFinalWithOutcomes = game?.resultsStatus === 'FINAL' && game?.outcomes && game.outcomes.length > 0;
  const isPointsBased = game?.winnerOfGame === 'BY_POINTS';

  const standings = useMemo(() => {
    if (!game) return [];
    if (isFinalWithOutcomes) {
      return standingsFromOutcomes(game.outcomes!, isPointsBased);
    }
    return calculateGameStandings(game, rounds, game.winnerOfGame || 'BY_MATCHES_WON');
  }, [game, rounds, isFinalWithOutcomes, isPointsBased]);

  const isMixPairsWithoutFixedTeams = !game.hasFixedTeams && game.genderTeams === 'MIX_PAIRS';

  const groupedStandings = useMemo(() => {
    if (isMixPairsWithoutFixedTeams) {
      const maleStandings = standings.filter(s => s.user.gender === 'MALE');
      const femaleStandings = standings.filter(s => s.user.gender === 'FEMALE');
      const maxPairs = Math.max(maleStandings.length, femaleStandings.length);

      const groups: Array<{ place: number; standings: typeof standings }> = [];
      for (let i = 0; i < maxPairs; i++) {
        const place = i + 1;
        const pair: typeof standings = [];
        
        if (i < maleStandings.length) {
          pair.push(maleStandings[i]);
        }
        if (i < femaleStandings.length) {
          pair.push(femaleStandings[i]);
        }

        if (pair.length > 0) {
          groups.push({ place, standings: pair });
        }
      }

      return groups;
    }

    // Group by position for fixed teams and regular games
    const placeMap = new Map<number, typeof standings>();
    standings.forEach(standing => {
      const place = standing.place;
      if (!placeMap.has(place)) {
        placeMap.set(place, []);
      }
      placeMap.get(place)!.push(standing);
    });

    return Array.from(placeMap.entries())
      .map(([place, standings]) => ({ place, standings }))
      .sort((a, b) => a.place - b.place);
  }, [standings, isMixPairsWithoutFixedTeams]);

  if (standings.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-gray-500 dark:text-gray-400">
        <p>{t('gameResults.noStatsAvailable') || 'No statistics available yet'}</p>
      </div>
    );
  }

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
        {groupedStandings.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-0">
            {group.standings.map((standing) => (
              <div
                key={standing.user.id}
                className={`grid ${gridCols} gap-4 items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50`}
              >
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 text-center">
                  {group.place}
                </div>
                <div>
                  <PlayerAvatar player={standing.user} extrasmall showName={false} fullHideName={true} />
                </div>
                <div className="text-sm font-small text-gray-900 dark:text-gray-100 break-words line-clamp-2">
                  {[standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ') || '-'}
                </div>
                <div className="text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                  {standing.wins}-{standing.ties}-{standing.losses}
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">
                    {standing.wins + standing.ties + standing.losses}
                  </span>
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
            {isMixPairsWithoutFixedTeams && groupIndex < groupedStandings.length - 1 && (
              <div className="border-t border-gray-300 dark:border-gray-600 mx-4"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
