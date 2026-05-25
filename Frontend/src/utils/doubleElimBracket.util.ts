import { mainR0MatchCount } from '@/utils/consolationBracket.util';

export function supportsDoubleElimination(
  entrantCount: number,
  customByeSeedRanks?: number[]
): boolean {
  return mainR0MatchCount(entrantCount, customByeSeedRanks) >= 2;
}
