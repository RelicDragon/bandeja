import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import type { ScoringPreset } from '@/types';
import type { CreateTemplate } from '@/sport/createFlow';
import { scoringModeFromPreset } from '@/utils/gameFormat/scoringCompatibility';
import { getGameTypeTemplate } from '@/utils/gameTypeTemplates';
import { resolveCreateTemplateGeneration } from '@/utils/gameFormat/createTemplateGeneration';

const POINTS_MODE_RANKING_DEFAULTS = {
  winnerOfGame: 'BY_SCORES_DELTA' as const,
  pointsPerWin: 0,
  pointsPerTie: 0,
  pointsPerLoose: 0,
};

const MATCH_MODE_RANKING_DEFAULTS = {
  winnerOfGame: 'BY_MATCHES_WON' as const,
  pointsPerWin: 0,
  pointsPerTie: 0,
  pointsPerLoose: 0,
};

export type ApplyCreateTemplateOverrides = {
  scoringPreset?: ScoringPreset;
  matchTimedCapMinutes?: number;
};

/** Applies scoring / generation settings only — roster and match size stay user-controlled above. */
export function applyCreateTemplate(
  template: CreateTemplate,
  format: UseGameFormatResult,
  maxParticipants?: number,
  overrides?: ApplyCreateTemplateOverrides,
): void {
  const preset =
    template.inlineConfig?.type === 'points_total'
      ? (overrides?.scoringPreset ??
        (format.scoringPreset.startsWith('POINTS_') ? format.scoringPreset : template.scoringPreset))
      : template.scoringPreset;
  const mode = scoringModeFromPreset(preset);
  if (format.scoringMode !== mode) {
    format.setScoringMode(mode);
  }
  if (format.scoringPreset !== preset) {
    format.setScoringPreset(preset);
  }

  const generation = resolveCreateTemplateGeneration(template, maxParticipants);
  format.setGenerationType(generation);

  const tmpl = getGameTypeTemplate(template.gameType);
  if (mode === 'POINTS') {
    format.setRanking(POINTS_MODE_RANKING_DEFAULTS);
  } else {
    format.setRanking({
      winnerOfGame: MATCH_MODE_RANKING_DEFAULTS.winnerOfGame,
      pointsPerWin: tmpl.pointsPerWin ?? 0,
      pointsPerLoose: tmpl.pointsPerLoose ?? 0,
      pointsPerTie: tmpl.pointsPerTie ?? 0,
    });
  }

  if (template.matchTimerEnabled) {
    format.setMatchTimerEnabled(true);
    const timedCandidate = overrides?.matchTimedCapMinutes ?? format.matchTimedCapMinutes;
    const cap =
      template.inlineConfig?.type === 'timed_duration' &&
      template.inlineConfig.options.includes(timedCandidate)
        ? timedCandidate
        : (template.matchTimedCapMinutes ?? 15);
    format.setMatchTimedCapMinutes(cap);
  } else {
    format.setMatchTimerEnabled(false);
  }

  if (template.hasGoldenPoint !== undefined) {
    format.setHasGoldenPoint(template.hasGoldenPoint);
  } else if (template.playersPerMatch === 2 && template.scoringPreset !== 'CLASSIC_FAST4') {
    format.setHasGoldenPoint(false);
  }
}
