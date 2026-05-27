import type { BracketSlotDto } from '@/api/leagues';
import type { LeagueRound } from '@/api/leagues';

export type BracketRoundLabelT = (
  key: string,
  opts?: { defaultValue?: string; round?: number }
) => string;

const BRACKET_ROUND_LABEL_KEYS: Record<string, string> = {
  final: 'gameDetails.bracketRoundFinal',
  semifinals: 'gameDetails.bracketRoundSemifinals',
  quarterfinals: 'gameDetails.bracketRoundQuarterfinals',
  'round of 16': 'gameDetails.bracketRoundOf16',
  'round of 32': 'gameDetails.bracketRoundOf32',
  'play-in': 'gameDetails.bracketColumnPlayIn',
  'play in': 'gameDetails.bracketColumnPlayIn',
  bye: 'gameDetails.bracketColumnByes',
  byes: 'gameDetails.bracketColumnByes',
  'third place': 'gameDetails.bracketColumnThirdPlace',
  'grand final': 'gameDetails.bracketTabGrandFinal',
};

/** Maps backend English roundLabel values to localized UI strings. */
export function translateBracketRoundLabel(
  label: string | null | undefined,
  t: BracketRoundLabelT
): string {
  const trimmed = label?.trim();
  if (!trimmed) return '';

  const normalized = trimmed.toLowerCase();
  const key = BRACKET_ROUND_LABEL_KEYS[normalized];
  if (key) return t(key);

  if (normalized.startsWith('play-in') || normalized.startsWith('play in')) {
    return t('gameDetails.bracketColumnPlayIn');
  }

  const roundMatch = /^round\s+(\d+)$/i.exec(trimmed);
  if (roundMatch) {
    return t('gameDetails.bracketColumnMainRound', { round: Number(roundMatch[1]) });
  }

  return trimmed;
}

/** Prefer the latest MAIN round label from loaded bracket slots (UX-A13/A15). */
export function resolveBracketRoundTitleFromSlots(slots: BracketSlotDto[]): string | null {
  const labeledMain = slots.filter(
    (s) => s.slotKind === 'MAIN' && typeof s.roundLabel === 'string' && s.roundLabel.trim().length > 0
  );
  if (labeledMain.length > 0) {
    const byRound = new Map<number, string>();
    for (const s of labeledMain) {
      byRound.set(s.roundIndex, s.roundLabel!.trim());
    }
    const maxIdx = Math.max(...byRound.keys());
    return byRound.get(maxIdx) ?? labeledMain[0].roundLabel!.trim();
  }
  const any = slots.find((s) => s.roundLabel?.trim());
  return any?.roundLabel?.trim() ?? null;
}

export function resolveBracketRoundPickerLabel(
  _round: LeagueRound,
  roundTitleFromSlots: string | null | undefined,
  genericLabel: string
): string {
  const trimmed = roundTitleFromSlots?.trim();
  if (trimmed) return trimmed;
  return genericLabel;
}
