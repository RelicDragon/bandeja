import type { BracketSlotDto } from '@/api/leagues';
import { feederRoundAbbrev } from '@/utils/bracketPreviewKnockout.util';
import type { BracketMainRoundLabelKey } from '@/utils/bracketStructure';
import { participantDisplayName } from '@/utils/leagueBracketLayout';

const ROUND_LABEL_KEY_MAP: Record<string, BracketMainRoundLabelKey> = {
  final: 'final',
  semifinals: 'semifinals',
  quarterfinals: 'quarterfinals',
  'round of 16': 'roundOf16',
  'round of 32': 'roundOf32',
};

export function roundLabelToAbbrev(roundLabel: string | null | undefined): string | null {
  const trimmed = roundLabel?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  const key = ROUND_LABEL_KEY_MAP[normalized];
  if (key) return feederRoundAbbrev(key);
  if (normalized === 'grand final') return 'GF';
  if (normalized === 'third place') return '3P';
  if (normalized.startsWith('play-in') || normalized.startsWith('play in')) return 'PI';
  if (normalized === 'bye' || normalized === 'byes') return 'BYE';
  const roundMatch = /^round\s+(\d+)$/i.exec(trimmed);
  if (roundMatch) return `R${roundMatch[1]}`;
  return null;
}

/** e.g. QF1, SF2, PI3 — matches bracket preview feeder labels. */
export function bracketMatchSlotLabel(slot: BracketSlotDto): string | null {
  if (slot.slotKind === 'BYE') {
    return slot.seedRank != null ? `BYE #${slot.seedRank}` : 'BYE';
  }
  const abbr = roundLabelToAbbrev(slot.roundLabel);
  if (!abbr) return null;
  return `${abbr}${slot.matchIndex + 1}`;
}

export function resolveFeederSlotLabel(
  feederId: string | null | undefined,
  lookup: Map<string, BracketSlotDto>
): string | null {
  if (!feederId) return null;
  const feeder = lookup.get(feederId);
  if (!feeder) return null;
  return bracketMatchSlotLabel(feeder);
}

export function resolveBracketSideDisplayLabel(
  participant: BracketSlotDto['participant'] | null | undefined,
  feederId: string | null | undefined,
  lookup: Map<string, BracketSlotDto>
): string | null {
  const name = participantDisplayName(participant);
  if (name) return name;
  return resolveFeederSlotLabel(feederId, lookup);
}
