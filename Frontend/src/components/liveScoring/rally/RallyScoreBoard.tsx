import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { RallyCourtProps } from './RallyCourtProps';

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
};

export function RallyScoreBoard({
  CourtComponent,
  teamAPlayers,
  teamBPlayers,
  teamAScore,
  teamBScore,
  setChips,
  setsWon,
  gameCap,
  gameLabel,
  className,
}: RallyScoreBoardProps) {
  const { t } = useTranslation();
  const multiGame = (setChips?.length ?? 0) > 1;

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
      <CourtComponent
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        teamAScore={teamAScore}
        teamBScore={teamBScore}
        className="w-full"
      />
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
    </div>
  );
}
