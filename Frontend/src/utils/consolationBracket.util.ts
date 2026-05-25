import { nextPowerOf2 } from '@/utils/bracketStructure';

export function mainR0MatchCount(entrantCount: number, byeSeedRanks?: number[]): number {
  const bracketSize = nextPowerOf2(entrantCount);
  const byeCount = bracketSize - entrantCount;
  void byeSeedRanks;
  const playInTeams = entrantCount < bracketSize ? entrantCount - byeCount : 0;
  const hasPlayInPhase = playInTeams > 0;
  const r0Matches = hasPlayInPhase ? bracketSize / 4 : bracketSize / 2;
  return r0Matches;
}

export function supportsConsolationBracket(entrantCount: number, byeSeedRanks?: number[]): boolean {
  return mainR0MatchCount(entrantCount, byeSeedRanks) >= 2;
}
