import { useTranslation } from 'react-i18next';
import type { ResultSummary } from '@/api/stories';
import {
  computeSetsRecord,
  isMatchWinFormat,
  isPointsFormat,
  isScoresDeltaFormat,
} from './storyResultStats';

type GameResultStoryStatsRowProps = {
  result: ResultSummary;
};

function scoreGradientClass(isWinner: boolean, made: number, lost: number): string {
  if (isWinner || made > lost) {
    return 'from-emerald-100 via-green-300 to-emerald-400';
  }
  if (made < lost) {
    return 'from-rose-100 via-red-300 to-rose-400';
  }
  return 'from-amber-100 via-yellow-200 to-amber-300';
}

function formatLevelChange(levelChange: number): string {
  const rounded = Math.round(levelChange * 100) / 100;
  if (rounded > 0) return `+${rounded.toFixed(2)}`;
  return rounded.toFixed(2);
}

function formatDelta(made: number, lost: number): string {
  const delta = made - lost;
  return delta > 0 ? `+${delta}` : String(delta);
}

export function GameResultStoryStatsRow({ result }: GameResultStoryStatsRowProps) {
  const { t } = useTranslation();
  const matches = result.matches ?? [];
  const record = t('stories.record', { wins: result.wins, losses: result.losses, ties: result.ties });
  const hasLevelChange = result.levelChange != null && Math.abs(result.levelChange) >= 0.001;
  const setsRecord = computeSetsRecord(matches);
  const hasSets = setsRecord.won > 0 || setsRecord.lost > 0;

  let secondaryLabel = t('stories.statsMatches');
  let secondaryPrimary = String(result.wins + result.losses + result.ties);
  let secondarySecondary: string | null = null;
  let secondaryGradient: string | null = null;

  if (isScoresDeltaFormat(result.winnerOfGame)) {
    const hasScore = result.scoresMade > 0 || result.scoresLost > 0;
    if (hasScore) {
      secondaryLabel = t('stories.statsScoreDelta');
      secondaryPrimary = `${result.scoresMade}:${result.scoresLost}`;
      secondarySecondary = `(${formatDelta(result.scoresMade, result.scoresLost)})`;
      secondaryGradient = scoreGradientClass(result.isWinner, result.scoresMade, result.scoresLost);
    }
  } else if (isMatchWinFormat(result.winnerOfGame) && hasSets) {
    secondaryLabel = t('stories.statsSets');
    secondaryPrimary = `${setsRecord.won}:${setsRecord.lost}`;
    secondarySecondary = `(${formatDelta(setsRecord.won, setsRecord.lost)})`;
    secondaryGradient = scoreGradientClass(result.isWinner, setsRecord.won, setsRecord.lost);
  } else if (isPointsFormat(result.winnerOfGame) && result.pointsEarned > 0) {
    secondaryLabel = t('stories.statsPoints');
    secondaryPrimary = t('stories.pointsEarned', { points: result.pointsEarned });
  }

  const showPointsTile = result.pointsEarned > 0 && !isPointsFormat(result.winnerOfGame);

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl border border-white/25 bg-white/12 px-3 py-2.5 text-left backdrop-blur-md">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {t('stories.statsRecord')}
        </p>
        <p className="mt-1 text-sm font-bold tabular-nums text-white">{record}</p>
      </div>

      <div className="rounded-2xl border border-white/25 bg-white/12 px-3 py-2.5 text-left backdrop-blur-md">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {secondaryLabel}
        </p>
        <p
          className={`mt-0.5 font-bold tabular-nums ${
            secondaryGradient
              ? `bg-gradient-to-br bg-clip-text text-2xl text-transparent ${secondaryGradient}`
              : secondaryPrimary.length > 8
                ? 'text-base text-white'
                : 'text-2xl text-white'
          }`}
        >
          {secondaryPrimary}
        </p>
        {secondarySecondary ? (
          <p className="text-[11px] font-medium tabular-nums text-white/70">{secondarySecondary}</p>
        ) : null}
      </div>

      {showPointsTile ? (
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2.5 text-left backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">
            {t('stories.statsPoints')}
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-emerald-100">
            {t('stories.pointsEarned', { points: result.pointsEarned })}
          </p>
        </div>
      ) : null}

      {hasLevelChange ? (
        <div className="rounded-2xl border border-sky-300/25 bg-sky-500/10 px-3 py-2.5 text-left backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100/70">
            {t('stories.statsLevel')}
          </p>
          <p
            className={`mt-1 text-sm font-bold tabular-nums ${
              (result.levelChange ?? 0) >= 0 ? 'text-emerald-100' : 'text-rose-100'
            }`}
          >
            {formatLevelChange(result.levelChange ?? 0)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
