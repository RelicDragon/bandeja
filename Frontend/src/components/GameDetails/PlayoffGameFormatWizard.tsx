import { GameFormatWizard } from '@/components';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import { useClampGameFormatToSport } from '@/hooks/useSportGameFormatLimits';
import { parseGameSport } from '@/utils/gameSport';
import type { Sport } from '@/sport/sportRegistry';

interface PlayoffGameFormatWizardProps {
  isOpen: boolean;
  format: UseGameFormatResult;
  sport?: string | null;
  onClose: () => void;
}

export function PlayoffGameFormatWizard({ isOpen, format, sport, onClose }: PlayoffGameFormatWizardProps) {
  const resolvedSport = (parseGameSport(sport) ?? 'PADEL') as Sport;
  const sportLimits = useClampGameFormatToSport(resolvedSport, format);

  return (
    <GameFormatWizard
      isOpen={isOpen}
      format={format}
      wizardEntityType="LEAGUE_SEASON"
      hideGenerationStep
      allowByPointsInRanking={false}
      allowedScoringModes={sportLimits.allowedScoringModes}
      allowedScoringPresets={sportLimits.allowedScoringPresets}
      onClose={onClose}
    />
  );
}
