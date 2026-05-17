import { useMemo } from 'react';
import type { BasicUser } from '@/types';
import { PlayerAvatar } from '@/components';
import {
  awardBadge,
  collectScoreSets,
  lineName,
  renderSplitScoreCell,
  type LeagueBoardCoreProps,
  teamHighlightClass,
} from '@/components/GameDetails/leagueGameCardBoardShared';

/** MatchCard-style: players stacked per team, split score columns. */
export function LeagueGameCardBoardType2({
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

  const teamARows = Math.max(teamAPlayers.length, 1);
  const teamBRows = Math.max(teamBPlayers.length, 1);

  const playersCol = 'minmax(0,1fr)';
  const gridTemplateColumns =
    setCount > 0 ? `${playersCol} repeat(${setCount}, 1.75rem)` : `${playersCol} auto`;

  const teamAStart = 1;
  const sepRow = teamAStart + teamARows;
  const teamBStart = sepRow + 1;

  const renderPlayerRow = (player: BasicUser, team: 'teamA' | 'teamB') => (
    <div
      className={`flex min-h-[26px] w-full min-w-0 flex-row items-center gap-1.5 px-0.5 py-0 ${teamHighlightClass(team, winner, isTie, 'emerald')}`}
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
  );

  return (
    <div className="grid min-w-0 w-full max-w-full gap-x-1" style={{ gridTemplateColumns }}>
      {teamAPlayers.map((player, i) => (
        <div key={player.id} style={{ gridColumn: 1, gridRow: teamAStart + i }} className="relative min-w-0">
          {i === 0 ? awardBadge(isFinal && winner === 'teamA', 'emerald') : null}
          {i === 0 ? awardBadge(isFinal && isTie, 'blue') : null}
          {renderPlayerRow(player, 'teamA')}
        </div>
      ))}

      {showScores
        ? scoreSets.map((set, colIndex) => (
            <div
              key={`a-${set.key}`}
              style={{
                gridColumn: colIndex + 2,
                gridRow: `${teamAStart} / span ${teamARows}`,
              }}
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
          style={{
            gridColumn: 2,
            gridRow: `${teamAStart} / span ${teamARows + 1 + teamBRows}`,
          }}
        >
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">VS</span>
        </div>
      ) : null}

      {teamBPlayers.map((player, i) => (
        <div key={player.id} style={{ gridColumn: 1, gridRow: teamBStart + i }} className="relative min-w-0">
          {i === 0 ? awardBadge(isFinal && winner === 'teamB', 'emerald') : null}
          {i === 0 ? awardBadge(isFinal && isTie, 'blue') : null}
          {renderPlayerRow(player, 'teamB')}
        </div>
      ))}

      {showScores
        ? scoreSets.map((set, colIndex) => (
            <div
              key={`b-${set.key}`}
              style={{ gridColumn: colIndex + 2, gridRow: `${teamBStart} / span ${teamBRows}` }}
              className="flex items-stretch justify-center"
            >
              {renderSplitScoreCell('teamB', set, leagueCardRules, t)}
            </div>
          ))
        : null}
    </div>
  );
}
