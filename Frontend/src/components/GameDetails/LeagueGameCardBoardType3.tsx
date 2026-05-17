import { useMemo } from 'react';
import { PlayerAvatar } from '@/components';
import {
  awardBadge,
  collectScoreSets,
  lineName,
  renderSplitScoreCell,
  type LeagueBoardCoreProps,
  teamHighlightClass,
} from '@/components/GameDetails/leagueGameCardBoardShared';

/** Compact layout: both team players in one horizontal row per team. */
export function LeagueGameCardBoardType3({
  teamAPlayers,
  teamBPlayers,
  winner,
  isTie,
  isFinal,
  allRounds,
  leagueCardRules,
  t,
}: LeagueBoardCoreProps) {
  const scoreSets = useMemo(() => collectScoreSets(isFinal ? allRounds : null), [allRounds, isFinal]);
  const showScores = isFinal && scoreSets.length > 0;
  const setCount = showScores ? scoreSets.length : 0;

  const playersCol = 'minmax(0,1fr)';
  const gridTemplateColumns =
    setCount > 0 ? `${playersCol} repeat(${setCount}, 1.75rem)` : `${playersCol} auto`;

  const teamARow = 1;
  const sepRow = 2;
  const teamBRow = 3;

  const renderTeamRoster = (players: typeof teamAPlayers, team: 'teamA' | 'teamB') => (
    <div
      className={`flex min-h-[26px] w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 py-0.5 ${teamHighlightClass(team, winner, isTie, 'emerald')}`}
    >
      {players.map((player) => (
        <div
          key={player.id}
          className="flex min-w-0 max-w-[calc(50%-0.25rem)] flex-1 basis-[calc(50%-0.25rem)] items-center gap-1"
        >
          <PlayerAvatar
            player={player}
            draggable={false}
            showName={false}
            inlineFace
            inlineFaceSize="sm"
            removable={false}
          />
          <span className="min-w-0 flex-1 truncate text-left text-[11px] font-medium leading-tight text-gray-800 dark:text-gray-200">
            {lineName(player)}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid min-w-0 w-full max-w-full gap-x-1" style={{ gridTemplateColumns }}>
      <div style={{ gridColumn: 1, gridRow: teamARow }} className="relative min-w-0">
        {awardBadge(isFinal && winner === 'teamA', 'emerald')}
        {awardBadge(isFinal && isTie, 'blue')}
        {renderTeamRoster(teamAPlayers, 'teamA')}
      </div>

      {showScores
        ? scoreSets.map((set, colIndex) => (
            <div
              key={`a-${set.key}`}
              style={{ gridColumn: colIndex + 2, gridRow: teamARow }}
              className="flex items-stretch justify-center"
            >
              {renderSplitScoreCell('teamA', set, leagueCardRules, t)}
            </div>
          ))
        : null}

      <div
        className="my-px flex min-h-0 items-center border-t border-gray-200/80 dark:border-gray-700/80"
        style={{ gridColumn: setCount > 0 ? `1 / ${setCount + 2}` : '1 / -1', gridRow: sepRow }}
      />

      {!showScores ? (
        <div
          className="flex items-center justify-center px-1"
          style={{ gridColumn: 2, gridRow: '1 / 4' }}
        >
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">VS</span>
        </div>
      ) : null}

      <div style={{ gridColumn: 1, gridRow: teamBRow }} className="relative min-w-0">
        {awardBadge(isFinal && winner === 'teamB', 'emerald')}
        {awardBadge(isFinal && isTie, 'blue')}
        {renderTeamRoster(teamBPlayers, 'teamB')}
      </div>

      {showScores
        ? scoreSets.map((set, colIndex) => (
            <div
              key={`b-${set.key}`}
              style={{ gridColumn: colIndex + 2, gridRow: teamBRow }}
              className="flex items-stretch justify-center"
            >
              {renderSplitScoreCell('teamB', set, leagueCardRules, t)}
            </div>
          ))
        : null}
    </div>
  );
}
