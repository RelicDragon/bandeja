import type { TFunction } from 'i18next';
import type { ScoringMode, ScoringPreset } from '@/types';

type TextField = 'title' | 'subtitle' | 'hint';

function pickTranslated(t: TFunction, keys: string[], fallback: string): string {
  for (const key of keys) {
    const v = t(key, { defaultValue: '' });
    if (v) return v;
  }
  return fallback;
}

export function tScoringPresetField(
  t: TFunction,
  preset: ScoringPreset,
  field: TextField,
  sport?: string | null,
): string {
  const base = `gameFormat.scoring.${preset}.${field}`;
  const sportKey = sport ? `gameFormat.scoring.${preset}.sport.${sport}.${field}` : null;
  const keys = sportKey ? [sportKey, base] : [base];
  return pickTranslated(t, keys, preset);
}

export function tScoringModeField(
  t: TFunction,
  mode: ScoringMode,
  field: TextField,
  sport?: string | null,
): string {
  const base = `gameFormat.scoringMode.${mode}.${field}`;
  const sportKey = sport ? `gameFormat.scoringMode.${mode}.sport.${sport}.${field}` : null;
  const keys = sportKey ? [sportKey, base] : [base];
  return pickTranslated(t, keys, mode);
}

export function tScoringShort(
  t: TFunction,
  preset: ScoringPreset,
  sport?: string | null,
): string {
  const base = `gameFormat.scoringShort.${preset}`;
  const sportKey = sport ? `gameFormat.scoringShort.${preset}BySport.${sport}` : null;
  const keys = sportKey ? [sportKey, base] : [base];
  return pickTranslated(t, keys, preset);
}

const STEP_HINT_KEYS = {
  scoringMode: 'stepScoringModeHint',
  setStructure: 'stepSetStructureHint',
  pointsTotal: 'stepPointsTotalHint',
  generation: 'stepGenerationHint',
  ranking: 'stepRankingHint',
} as const;

export type GameFormatStepHintId = keyof typeof STEP_HINT_KEYS;

export function tGameFormatStepHint(
  t: TFunction,
  step: GameFormatStepHintId,
  sport?: string | null,
): string {
  const key = STEP_HINT_KEYS[step];
  const sportKey = sport ? `gameFormat.${key}BySport.${sport}` : null;
  const keys = sportKey ? [sportKey, `gameFormat.${key}`] : [`gameFormat.${key}`];
  return pickTranslated(t, keys, '');
}

export function tBestOfMatchLabel(t: TFunction, sport?: string | null): string {
  const sportKey = sport ? `gameFormat.bestOfMatch.labelBySport.${sport}` : null;
  const keys = sportKey
    ? [sportKey, 'gameFormat.bestOfMatch.label']
    : ['gameFormat.bestOfMatch.label'];
  return pickTranslated(t, keys, 'Best-of match (games)');
}
