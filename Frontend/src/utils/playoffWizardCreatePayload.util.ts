import type { CustomPlayInPairingDto } from '@/api/leagues';
import type { PlayInSeedPair } from '@/utils/bracketCustomPlayIn.util';
import { bracketPlanOptionsFromWizardConfig } from '@/utils/playoffWizardBracketPlan.util';
import { buildBracketPlan } from '@/utils/bracketStructure';

export type PerGroupBracketCreateGroup = {
  leagueGroupId: string;
  participantIds: string[];
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customByeSeedRanks?: number[];
  customPlayInPairings?: CustomPlayInPairingDto[];
};

function toCustomPlayInPairings(pairs: PlayInSeedPair[]): CustomPlayInPairingDto[] | undefined {
  if (!pairs.length) return undefined;
  return pairs.map(([seedA, seedB]) => ({ seedA, seedB }));
}

/** Per-group POST group entry — mirrors preview order + custom options. */
export function buildPerGroupBracketCreateGroup(params: {
  leagueGroupId: string;
  participantIds: string[];
  customByeEnabled: boolean;
  customByeSeedRanks: number[];
  customPlayInEnabled: boolean;
  playInSeedPairs: PlayInSeedPair[];
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
}): PerGroupBracketCreateGroup {
  const planOptions = bracketPlanOptionsFromWizardConfig({
    customByeEnabled: params.customByeEnabled,
    customByeSeedRanks: params.customByeSeedRanks,
    customPlayInEnabled: params.customPlayInEnabled,
    playInSeedPairs: params.playInSeedPairs,
  });
  const plan = buildBracketPlan(params.participantIds.length, params.participantIds, planOptions);
  const playInPairs = params.customPlayInEnabled ? params.playInSeedPairs : [];
  return {
    leagueGroupId: params.leagueGroupId,
    participantIds: plan.orderedParticipantIds,
    includeThirdPlace: params.includeThirdPlace || undefined,
    includeConsolationBracket: params.includeConsolationBracket || undefined,
    includeDoubleElimination: params.includeDoubleElimination || undefined,
    customByeSeedRanks: planOptions?.customByeSeedRanks,
    customPlayInPairings: toCustomPlayInPairings(playInPairs),
  };
}
