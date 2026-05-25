import type { PlayInSeedPair } from '@/utils/bracketCustomPlayIn.util';
import type { BuildBracketPlanOptions } from '@/utils/bracketStructure';

export function bracketPlanOptionsFromWizardConfig(params: {
  customByeEnabled: boolean;
  customByeSeedRanks: number[];
  customPlayInEnabled: boolean;
  playInSeedPairs: PlayInSeedPair[];
}): BuildBracketPlanOptions | undefined {
  const customByeSeedRanks = params.customByeEnabled ? params.customByeSeedRanks : undefined;
  const playInSeedPairs = params.customPlayInEnabled ? params.playInSeedPairs : undefined;
  if (!customByeSeedRanks?.length && !playInSeedPairs?.length) return undefined;
  return {
    customByeSeedRanks: customByeSeedRanks?.length ? customByeSeedRanks : undefined,
    playInSeedPairs: playInSeedPairs?.length ? playInSeedPairs : undefined,
  };
}

export function formatPlayInPairsForSummary(pairs: PlayInSeedPair[]): string {
  return pairs.map(([a, b]) => `${a} vs ${b}`).join(', ');
}
