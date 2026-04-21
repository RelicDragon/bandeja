import { useTranslation } from 'react-i18next';
import { UseGameFormatResult } from '@/hooks/useGameFormat';
import { automaticGenerationCopyKey } from '@/utils/gameFormat';

interface GameFormatDetailsProps {
  format: UseGameFormatResult;
  /** Max participants (or create-game capacity) — refines Automatic generation copy. */
  generationSlotCount?: number;
  hasFixedTeams?: boolean;
}

interface DetailRowProps {
  label: string;
  value?: string;
  note?: string;
}

const DetailRow = ({ label, value, note }: DetailRowProps) => (
  <div className="py-2">
    <div className={`flex items-baseline gap-3 ${value ? 'justify-between' : ''}`}>
      <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {value ? (
        <span className="text-xs font-semibold text-gray-900 dark:text-white text-right">
          {value}
        </span>
      ) : null}
    </div>
    {note && (
      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-500 leading-relaxed">
        {note}
      </p>
    )}
  </div>
);

const genKey = (g: string) =>
  g.split('_').map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join('');

export const GameFormatDetails = ({ format, generationSlotCount, hasFixedTeams }: GameFormatDetailsProps) => {
  const { t } = useTranslation();
  const {
    scoringMode,
    scoringPreset,
    generationType,
    hasGoldenPoint,
    isTimed,
    matchTimedCapMinutes,
    customPointsTotal,
    pointsPerWin,
    pointsPerLoose,
    pointsPerTie,
    winnerOfGame,
    setupPayload,
  } = format;

  const scoringTitle = isTimed
    ? scoringPreset === 'CLASSIC_TIMED'
      ? t('gameFormat.scoring.CLASSIC_TIMED.title')
      : t('gameFormat.timedMatch.title')
    : customPointsTotal != null
      ? t('gameFormat.customPoints.short', { count: customPointsTotal })
      : t(`gameFormat.scoring.${scoringPreset}.title`);
  const scoringSubtitle = isTimed
    ? scoringPreset === 'CLASSIC_TIMED'
      ? t('gameFormat.timedMatch.descriptionClassic')
      : t('gameFormat.timedMatch.description')
    : customPointsTotal != null
      ? ''
      : t(`gameFormat.scoring.${scoringPreset}.subtitle`, { defaultValue: '' });

  const genLabel = t(`gameFormat.generation.${genKey(generationType)}.title`);
  const automaticCopyKey = automaticGenerationCopyKey(generationSlotCount, hasFixedTeams);
  const genNote =
    generationType === 'AUTOMATIC'
      ? t(`gameFormat.generation.Automatic.subtitle.${automaticCopyKey}`)
      : t(`gameFormat.generation.${genKey(generationType)}.subtitle`, { defaultValue: '' });

  const pts = setupPayload.maxTotalPointsPerSet ?? 0;
  const isClassic = scoringMode === 'CLASSIC';

  const winnerOfGameLabel =
    winnerOfGame === 'BY_MATCHES_WON'
      ? t('gameResults.byMatchesWon')
      : winnerOfGame === 'BY_SCORES_DELTA'
        ? t('gameResults.byScoresDelta')
        : winnerOfGame === 'BY_POINTS'
          ? t('gameResults.byPoints')
          : String(winnerOfGame);

  const showRankingPoints = winnerOfGame === 'BY_POINTS';

  return (
    <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 px-3 py-1 divide-y divide-gray-200/70 dark:divide-gray-700/70">
      <DetailRow
        label={t('gameFormat.steps.scoringMode')}
        value={t(`gameFormat.scoringMode.${scoringMode}.title`)}
        note={t(`gameFormat.scoringMode.${scoringMode}.subtitle`, { defaultValue: '' }) || undefined}
      />
      <DetailRow
        label={t('gameFormat.steps.setStructure')}
        value={scoringTitle}
        note={scoringSubtitle || undefined}
      />
      {isTimed && (
        <DetailRow
          label={t('gameFormat.timedMatch.durationTitle')}
          value={t('gameFormat.timedMatch.minutesLabel', {
            minutes: Math.min(60, Math.max(1, matchTimedCapMinutes || 15)),
          })}
        />
      )}
      {isClassic && (
        <DetailRow
          label={
            hasGoldenPoint
              ? t('gameFormat.goldenPoint.title')
              : t('gameFormat.goldenPoint.titleAdvantage')
          }
          note={hasGoldenPoint ? t('gameFormat.goldenPoint.description') : t('gameFormat.goldenPoint.descriptionOff')}
        />
      )}
      <DetailRow
        label={t('gameFormat.steps.generation')}
        value={genLabel}
        note={genNote || undefined}
      />
      {pts > 0 && (
        <DetailRow
          label={t('gameResults.maxTotalPointsPerSet')}
          value={String(pts)}
        />
      )}
      <DetailRow
        label={t('gameResults.winnerOfGame')}
        value={winnerOfGameLabel}
      />
      {showRankingPoints && (
        <DetailRow
          label={t('gameFormat.points.title')}
          value={`${pointsPerWin} · ${pointsPerTie} · ${pointsPerLoose}`}
          note={`${t('gameResults.win')} · ${t('gameResults.tie')} · ${t('gameResults.loose')}`}
        />
      )}
    </div>
  );
};
