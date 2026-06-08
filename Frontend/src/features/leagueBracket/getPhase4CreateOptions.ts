import { byeCountForEntrants, supportsThirdPlaceMatch } from '@/utils/customByeSeedRanks.util';
import { supportsConsolationBracket } from '@/utils/consolationBracket.util';
import { supportsDoubleElimination } from '@/utils/doubleElimBracket.util';
import type { Phase4CreateOptionsVisibility } from './types';

export function getPhase4CreateOptionsVisibility(
  entrantCount: number,
  customByeSeedRanks: number[] = []
): Phase4CreateOptionsVisibility {
  return {
    showThird: supportsThirdPlaceMatch(entrantCount),
    showConsolation: supportsConsolationBracket(entrantCount, customByeSeedRanks),
    showDoubleElim: supportsDoubleElimination(entrantCount, customByeSeedRanks),
    byeCount: byeCountForEntrants(entrantCount),
  };
}
