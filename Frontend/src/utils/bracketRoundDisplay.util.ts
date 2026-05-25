import type { BracketSlotDto } from '@/api/leagues';
import type { LeagueRound } from '@/api/leagues';

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
