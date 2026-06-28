import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Game, GameOutcome } from '@/types';
import { Round } from '@/types/gameResults';
import { calculateGameStandings, PlayerStanding } from '@/services/gameStandings';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { buildPlayerMatchDetails } from './playerStatsDetails';
import { PlayerStatsExpandedRow } from './PlayerStatsExpandedRow';

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
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<string>>(new Set());

  const isFinalWithOutcomes = game?.resultsStatus === 'FINAL' && game?.outcomes && game.outcomes.length > 0;
  const isPointsBased = game?.winnerOfGame === 'BY_POINTS';
  const isScoresMadeBased = game?.winnerOfGame === 'BY_SCORES_MADE';

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

  const playerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const participant of game.participants || []) {
      const fullName = [participant.user?.firstName, participant.user?.lastName].filter(Boolean).join(' ').trim();
      if (participant.userId && fullName) {
        map[participant.userId] = fullName;
      }
    }
    for (const standing of standings) {
      const fullName = [standing.user?.firstName, standing.user?.lastName].filter(Boolean).join(' ').trim();
      if (standing.user?.id && fullName && !map[standing.user.id]) {
        map[standing.user.id] = fullName;
      }
    }
    return map;
  }, [game.participants, standings]);

  if (standings.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-gray-500 dark:text-gray-400">
        <p>{t('gameResults.noStatsAvailable') || 'No statistics available yet'}</p>
      </div>
    );
  }

  const tablePx = 'px-3';
  const gridCols = isPointsBased
    ? 'grid-cols-[0.65rem_1.5rem_minmax(0,1fr)_2.75rem_minmax(3.25rem,auto)_2rem]'
    : 'grid-cols-[0.65rem_1.5rem_minmax(0,1fr)_2.75rem_minmax(3.25rem,auto)]';
  const gridGap = 'gap-x-1';

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
      className: 'pl-4'
    },
    {
      key: 'winsTiesLosses',
      header: t('gameResults.winsTiesLosses') || 'W-T-L',
      className: 'text-center'
    },
    {
      key: 'scores',
      header: isScoresMadeBased
        ? (t('gameResults.byScoresMade') || 'By Balls Won')
        : (t('gameResults.scores') || 'Scores'),
      className: 'text-right'
    },
    ...(isPointsBased ? [{
      key: 'points',
      header: t('gameResults.points') || 'Points',
      className: 'text-center'
    }] : [])
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div
        className={`grid ${gridCols} ${gridGap} gap-y-0 items-center ${tablePx} py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900`}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={`text-[10px] font-semibold leading-tight text-gray-500 dark:text-gray-400 uppercase tracking-wide ${column.className}`}
          >
            {column.header}
          </div>
        ))}
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {groupedStandings.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-0">
            {group.standings.map((standing) => {
              const isExpanded = expandedPlayerIds.has(standing.user.id);
              const details = buildPlayerMatchDetails(rounds, standing.user.id, playerNameById);
              const toggleExpanded = () => {
                setExpandedPlayerIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(standing.user.id)) {
                    next.delete(standing.user.id);
                  } else {
                    next.add(standing.user.id);
                  }
                  return next;
                });
              };

              return (
                <Fragment key={standing.user.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={toggleExpanded}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpanded();
                      }
                    }}
                    className={`grid ${gridCols} ${gridGap} gap-y-0 items-start ${tablePx} py-1.5 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer`}
                  >
                    <div className="self-center text-[11px] font-medium tabular-nums text-gray-500 dark:text-gray-400 text-center leading-none">
                      {group.place}
                    </div>
                    <div className="self-center flex justify-center -mx-0.5">
                      <PlayerAvatar player={standing.user} extrasmall showName={false} fullHideName={true} />
                    </div>
                    <div className="min-w-0 pl-2 leading-tight py-0.5">
                      <div className="text-xs text-gray-900 dark:text-gray-100 truncate leading-none">
                        {standing.user.firstName?.trim() || '\u00A0'}
                      </div>
                      <div className="text-xs text-gray-900 dark:text-gray-100 truncate leading-none mt-0.5">
                        {standing.user.lastName?.trim() || (standing.user.firstName?.trim() ? '\u00A0' : '-')}
                      </div>
                      {standing.user.verbalStatus && (
                        <p className="verbal-status text-[10px] leading-none truncate mt-0.5">
                          {standing.user.verbalStatus}
                        </p>
                      )}
                    </div>
                    <div className="text-center leading-tight tabular-nums py-0.5">
                      <div className="text-xs font-medium text-gray-900 dark:text-gray-100 leading-none">
                        {standing.wins}-{standing.ties}-{standing.losses}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-none mt-0.5">
                        {standing.wins + standing.ties + standing.losses}
                      </div>
                    </div>
                    <div className="text-right leading-tight tabular-nums py-0.5">
                      <div className="text-xs font-medium text-gray-900 dark:text-gray-100 leading-none">
                        {isScoresMadeBased ? (
                          <>
                            <span className="font-bold">{standing.scoresMade}</span>-{standing.scoresLost}
                          </>
                        ) : (
                          <>{standing.scoresMade}-{standing.scoresLost}</>
                        )}
                      </div>
                      <div
                        className={`text-[10px] leading-none mt-0.5 ${
                          isScoresMadeBased
                            ? 'text-gray-400 dark:text-gray-500'
                            : standing.scoresDelta > 0
                              ? 'text-green-600 dark:text-green-400'
                              : standing.scoresDelta < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        {standing.scoresDelta > 0 ? '+' : ''}
                        {standing.scoresDelta}
                      </div>
                    </div>
                    {isPointsBased && (
                      <div className="self-center text-center text-xs font-medium tabular-nums text-gray-900 dark:text-gray-100">
                        {standing.points}
                      </div>
                    )}
                </div>
                  <div
                    className={`grid transition-all duration-200 ease-out ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <PlayerStatsExpandedRow details={details} />
                    </div>
                  </div>
                </Fragment>
              );
            })}
            {isMixPairsWithoutFixedTeams && groupIndex < groupedStandings.length - 1 && (
              <div className="border-t border-gray-300 dark:border-gray-600 mx-3" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
