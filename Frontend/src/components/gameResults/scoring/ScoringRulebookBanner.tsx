import { Zap } from 'lucide-react';
import { GameFormatSummary } from '@/components/gameFormat/GameFormatSummary';
import { Game } from '@/types';
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
        | 'deucesBeforeGoldenPoint'
        | 'matchTimedCapMinutes'
        | 'matchTimerEnabled'
        | 'winnerOfGame'
        | 'playersPerMatch'
        | 'sport'
      >
    | null
    | undefined;
}

export const ScoringRulebookBanner = ({ game }: ScoringRulebookBannerProps) => {
  if (!game || !game.scoringPreset) return null;

  const scoringMode = detectScoringMode(game as Partial<Game>);

  return (
    <div className="mb-2 flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-gray-200/80 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-200">
        <GameFormatSummary
          scoringMode={scoringMode}
          scoringPreset={game.scoringPreset}
          generationType={game.matchGenerationType ?? undefined}
          deucesBeforeGoldenPoint={game.deucesBeforeGoldenPoint}
          matchTimerEnabled={isGameMatchTimerEnabled(game)}
          matchTimedCapMinutes={game.matchTimedCapMinutes}
          winnerOfGame={game.winnerOfGame}
          playersPerMatch={game.playersPerMatch}
          sport={game.sport}
        />
        {scoringMode === 'CLASSIC' && game.deucesBeforeGoldenPoint != null && (
          <Zap size={12} className="text-yellow-500" />
        )}
      </div>
    </div>
  );
};
