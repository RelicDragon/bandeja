import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ChangeEndsSideTag } from '../ChangeEndsSideMarkers';
import type { RallyCourtProps } from './RallyCourtProps';
import { LIVE_COURT_FIT_CLASS } from '../LiveCourtViewport';

export type RallySetChip = {
  teamA: number;
  teamB: number;
  isActive: boolean;
};

type RallyScoreBoardProps = RallyCourtProps & {
  CourtComponent: ComponentType<RallyCourtProps>;
  setChips?: RallySetChip[];
  setsWon?: { teamA: number; teamB: number };
  gameCap?: number;
  gameLabel?: string;
  /** Hide set chips / match score — court only (scores shown elsewhere). */
  courtOnly?: boolean;
  changeEndsBeforeNextPoint?: boolean;
};

export function RallyScoreBoard({
  CourtComponent,
  teamAPlayers,
  teamBPlayers,
  teamAScore,
  teamBScore,
  matchDoubles,
  serverTeam,
  serverPlayerIndex,
  courtSide,
  courtEndsSwapped,
  courtTeamASidesMirrored,
  courtTeamBSidesMirrored,
  motionToken,
  setChips,
  setsWon,
  gameCap,
  gameLabel,
  courtOnly = false,
  changeEndsBeforeNextPoint = false,
  className,
}: RallyScoreBoardProps) {
  const { t } = useTranslation();
  const multiGame = !courtOnly && (setChips?.length ?? 0) > 1;
  const changeEndsLabel = t('gameDetails.liveScoring.changeEnds');

  const court = (
    <CourtComponent
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      teamAScore={teamAScore}
      teamBScore={teamBScore}
      matchDoubles={matchDoubles}
      serverTeam={serverTeam}
      serverPlayerIndex={serverPlayerIndex}
      courtSide={courtSide}
      courtEndsSwapped={courtEndsSwapped}
      courtTeamASidesMirrored={courtTeamASidesMirrored}
      courtTeamBSidesMirrored={courtTeamBSidesMirrored}
      motionToken={motionToken}
      className={
        courtOnly
          ? LIVE_COURT_FIT_CLASS
          : changeEndsBeforeNextPoint
            ? 'w-full max-w-[13rem] shrink-0'
            : 'w-full'
      }
    />
  );

  if (courtOnly) {
    return (
      <div className={`size-full min-h-0 min-w-0 overflow-hidden ${className ?? ''}`}>{court}</div>
    );
  }

  return (
    <div className={`flex w-full max-w-md flex-col items-center gap-4 ${className ?? ''}`}>
      {multiGame && setsWon ? (
        <div className="flex w-full items-center justify-center gap-3 text-sm font-semibold tabular-nums opacity-70">
          <span>{setsWon.teamA}</span>
          <span className="text-xs uppercase tracking-wide opacity-60">
            {t('gameDetails.liveScoring.setsWonShort', { defaultValue: 'Sets' })}
          </span>
          <span>{setsWon.teamB}</span>
        </div>
      ) : null}
      {multiGame && setChips?.length ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {setChips.map((chip, i) => (
            <span
              key={`set-${i}`}
              className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                chip.isActive
                  ? 'bg-primary-500/15 text-primary-900 ring-1 ring-primary-400/50 dark:text-primary-100'
                  : 'bg-black/5 text-gray-700 dark:bg-white/10 dark:text-gray-200'
              }`}
            >
              {chip.teamA}–{chip.teamB}
            </span>
          ))}
        </div>
      ) : null}
      {changeEndsBeforeNextPoint ? (
        <div className="flex w-full items-stretch justify-center gap-1.5">
          <ChangeEndsSideTag side="left" label={changeEndsLabel} />
          {court}
          <ChangeEndsSideTag side="right" label={changeEndsLabel} />
        </div>
      ) : (
        court
      )}
      {!courtOnly ? (
      <div className="flex w-full flex-col items-center gap-1">
        {gameLabel || gameCap ? (
          <p className="m-0 text-xs font-medium uppercase tracking-wide opacity-50">
            {gameLabel ??
              t('gameDetails.liveScoring.rallyGameTo', {
                defaultValue: 'Game to {{n}}',
                n: gameCap,
              })}
          </p>
        ) : null}
        <div className="flex w-full items-center justify-center gap-10 tabular-nums">
          <div className="text-4xl font-black leading-none">{teamAScore}</div>
          <span className="text-lg font-semibold opacity-40">:</span>
          <div className="text-4xl font-black leading-none">{teamBScore}</div>
        </div>
      </div>
      ) : null}
    </div>
  );
}
