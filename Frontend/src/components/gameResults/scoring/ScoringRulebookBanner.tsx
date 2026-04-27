import { useTranslation } from 'react-i18next';
import { Zap, Dumbbell } from 'lucide-react';
import { Game } from '@/types';
import { summarizeGameFormat } from '@/utils/gameFormat/summarizeGameFormat';
import { detectScoringMode } from '@/utils/gameFormat/detectPreset';
import { isGameMatchTimerEnabled } from '@/utils/matchTimer';

interface ScoringRulebookBannerProps {
  game:
    | Pick<
        Game,
        | 'gameType'
        | 'scoringPreset'
        | 'scoringMode'
        | 'matchGenerationType'
        | 'hasGoldenPoint'
        | 'matchTimedCapMinutes'
        | 'matchTimerEnabled'
      >
    | null
    | undefined;
}

export const ScoringRulebookBanner = ({ game }: ScoringRulebookBannerProps) => {
  const { t } = useTranslation();
  if (!game || !game.scoringPreset) return null;

  const scoringMode = detectScoringMode(game as Partial<Game>);
  const text = summarizeGameFormat(t, {
    scoringMode,
    scoringPreset: game.scoringPreset,
    generationType: game.matchGenerationType ?? undefined,
    hasGoldenPoint: !!game.hasGoldenPoint,
    matchTimerEnabled: isGameMatchTimerEnabled(game),
    matchTimedCapMinutes: game.matchTimedCapMinutes,
  });

  return (
    <div className="mb-2 flex justify-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200">
        <Dumbbell size={12} className="text-primary-500" />
        <span>{text}</span>
        {scoringMode === 'CLASSIC' && !!game.hasGoldenPoint && (
          <Zap size={12} className="text-yellow-500" />
        )}
      </div>
    </div>
  );
};
