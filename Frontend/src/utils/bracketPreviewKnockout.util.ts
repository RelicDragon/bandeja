import type { BracketMainRoundLabelKey, BracketPlan } from '@/utils/bracketStructure';
import { standardFirstRoundPairings } from '@/utils/bracketStructure';

export function feederRoundAbbrev(labelKey: BracketMainRoundLabelKey): string {
  switch (labelKey) {
    case 'final':
      return 'F';
    case 'semifinals':
      return 'SF';
    case 'quarterfinals':
      return 'QF';
    case 'roundOf16':
      return 'R16';
    case 'roundOf32':
      return 'R32';
    default:
      return 'M';
  }
}

export function firstMainRoundPairingsForPlan(plan: BracketPlan): Array<[number, number]> {
  const pairingSize = plan.playInGameCount > 0 ? plan.bracketSize / 2 : plan.bracketSize;
  return standardFirstRoundPairings(pairingSize);
}

export function feederMatchLabelsForRound(
  plan: BracketPlan,
  roundIndex: number,
  matchIndex: number
): [string, string] {
  const prev = plan.mainRounds[roundIndex - 1];
  if (!prev) return ['—', '—'];
  const abbr = feederRoundAbbrev(prev.labelKey);
  const a = matchIndex * 2 + 1;
  const b = matchIndex * 2 + 2;
  return [`${abbr}${a}`, `${abbr}${b}`];
}

export function isSeedInFirstMainRound(plan: BracketPlan, seed: number): boolean {
  return firstMainRoundPairingsForPlan(plan).some(([a, b]) => a === seed || b === seed);
}
