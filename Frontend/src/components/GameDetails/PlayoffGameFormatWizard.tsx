import { GameFormatWizard } from '@/components';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import { useClampGameFormatToSport } from '@/hooks/useSportGameFormatLimits';
import { parseGameSport } from '@/utils/gameSport';
import type { Sport } from '@/sport/sportRegistry';
import type { EntityType, ScoringPreset } from '@/types';

interface PlayoffGameFormatWizardProps {
  isOpen: boolean;
  format: UseGameFormatResult;
  sport?: string | null;
  entityType?: EntityType;
  generationSlotCount?: number;
  playersPerMatch?: number;
  hasFixedTeams?: boolean;
  allowedScoringPresets?: ScoringPreset[];
  onClose: () => void;
}

export function PlayoffGameFormatWizard({
  isOpen,
  format,
  sport,
  entityType = 'LEAGUE_SEASON',
  generationSlotCount,
  playersPerMatch,
  hasFixedTeams,
  allowedScoringPresets,
  onClose,
}: PlayoffGameFormatWizardProps) {
  const resolvedSport = (parseGameSport(sport) ?? 'PADEL') as Sport;
  const sportLimits = useClampGameFormatToSport(resolvedSport, format);

  return (
    <GameFormatWizard
      isOpen={isOpen}
      format={format}
      wizardEntityType={entityType}
      generationSlotCount={generationSlotCount}
      playersPerMatch={playersPerMatch}
      hasFixedTeams={hasFixedTeams}
      hideGenerationStep
      allowByPointsInRanking={false}
      allowedScoringModes={sportLimits.allowedScoringModes}
      allowedScoringPresets={allowedScoringPresets ?? sportLimits.allowedScoringPresets}
      onClose={onClose}
    />
  );
}
