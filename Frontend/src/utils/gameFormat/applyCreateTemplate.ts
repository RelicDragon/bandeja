import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import type { CreateTemplate } from '@/sport/createFlow';
import { scoringModeFromPreset } from '@/utils/gameFormat/scoringCompatibility';
import { getGameTypeTemplate } from '@/utils/gameTypeTemplates';

const POINTS_MODE_RANKING_DEFAULTS = {
  winnerOfGame: 'BY_SCORES_DELTA' as const,
  pointsPerWin: 0,
  pointsPerTie: 0,
  pointsPerLoose: 0,
};

/** Applies scoring / generation settings only — roster and match size stay user-controlled above. */
export function applyCreateTemplate(template: CreateTemplate, format: UseGameFormatResult): void {
  const mode = scoringModeFromPreset(template.scoringPreset);
  if (format.scoringMode !== mode) {
    format.setScoringMode(mode);
  }
  format.setScoringPreset(template.scoringPreset);
  format.setGenerationType(template.matchGenerationType);

  const tmpl = getGameTypeTemplate(template.gameType);
  if (mode === 'POINTS') {
    format.setRanking(POINTS_MODE_RANKING_DEFAULTS);
  } else {
    format.setRanking({
      winnerOfGame: tmpl.winnerOfGame,
      pointsPerWin: tmpl.pointsPerWin ?? 0,
      pointsPerLoose: tmpl.pointsPerLoose ?? 0,
      pointsPerTie: tmpl.pointsPerTie ?? 0,
    });
  }

  if (template.matchTimerEnabled) {
    format.setMatchTimerEnabled(true);
    format.setMatchTimedCapMinutes(template.matchTimedCapMinutes ?? 15);
  } else {
    format.setMatchTimerEnabled(false);
  }

  if (template.hasGoldenPoint !== undefined) {
    format.setHasGoldenPoint(template.hasGoldenPoint);
  } else if (template.playersPerMatch === 2 && template.scoringPreset !== 'CLASSIC_FAST4') {
    format.setHasGoldenPoint(false);
  }
}
