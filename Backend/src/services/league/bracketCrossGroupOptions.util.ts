import type { CustomPlayInPairing } from './bracketStructure';

export type CrossGroupBracketPlanOptions = {
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customByeSeedRanks?: number[];
  customPlayInPairings?: CustomPlayInPairing[];
};

export function resolveCrossGroupBracketPlanOptions(
  crossGroup: CrossGroupBracketPlanOptions,
  topLevel: CrossGroupBracketPlanOptions
): CrossGroupBracketPlanOptions {
  return {
    includeThirdPlace: crossGroup.includeThirdPlace ?? topLevel.includeThirdPlace,
    includeConsolationBracket:
      crossGroup.includeConsolationBracket ?? topLevel.includeConsolationBracket,
    includeDoubleElimination:
      crossGroup.includeDoubleElimination ?? topLevel.includeDoubleElimination,
    customByeSeedRanks: crossGroup.customByeSeedRanks ?? topLevel.customByeSeedRanks,
    customPlayInPairings:
      crossGroup.customPlayInPairings ?? topLevel.customPlayInPairings,
  };
}
