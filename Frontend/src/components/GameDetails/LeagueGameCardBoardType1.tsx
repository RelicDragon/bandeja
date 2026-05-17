import { useMemo } from 'react';
import { PlayerAvatar } from '@/components';
import {
  awardBadge,
  collectScoreSets,
  type LeagueBoardCoreProps,
  teamHighlightClass,
} from '@/components/GameDetails/leagueGameCardBoardShared';
import { isSuperTieBreakDeciderRow } from '@/utils/scoring';

/** Original layout: team blocks side-by-side with avatars in a row, combined scores in the center. */
export function LeagueGameCardBoardType1({
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
  const showScores =
    isFinal &&
    scoreSets.length > 0;

  const renderTeamBlock = (players: typeof teamAPlayers, team: 'teamA' | 'teamB') => (
    <div
      className={`min-h-[20px] p-2 flex items-center justify-center ${teamHighlightClass(team, winner, isTie, 'yellow')}`}
    >
      <div className="flex gap-3 justify-center sm:gap-5">
        {players.map((player) => (
          <PlayerAvatar
            key={player.id}
            player={player}
            draggable={false}
            showName={true}
            extrasmall={true}
            removable={false}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex w-full items-center justify-center gap-3">
      <div className="relative flex justify-start">
        {renderTeamBlock(teamAPlayers, 'teamA')}
        {awardBadge(isFinal && winner === 'teamA', 'yellow', 'md')}
        {awardBadge(isFinal && isTie, 'blue', 'md')}
      </div>

      {showScores ? (
        <div className="flex max-h-32 flex-col items-center gap-1 overflow-y-auto">
          {scoreSets.map((set) => (
            <div
              key={set.key}
              className="flex flex-col items-center gap-0 rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <span>
                {set.teamAScore}:{set.teamBScore}
                {set.role === 'EXTRA_GAMES' || set.role === 'EXTRA_BALLS' ? (
                  <span className="text-violet-500">*</span>
                ) : null}
              </span>
              {set.isTieBreak ? (
                <span className="text-[9px] font-medium leading-none text-primary-600 dark:text-primary-400">
                  {isSuperTieBreakDeciderRow(leagueCardRules, set.setIndex, set.isTieBreak)
                    ? t('gameResults.superTieBreakAbbr')
                    : t('gameResults.tieBreakAbbr')}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">VS</div>
      )}

      <div className="relative flex justify-start">
        {renderTeamBlock(teamBPlayers, 'teamB')}
        {awardBadge(isFinal && winner === 'teamB', 'yellow', 'md')}
        {awardBadge(isFinal && isTie, 'blue', 'md')}
      </div>
    </div>
  );
}
