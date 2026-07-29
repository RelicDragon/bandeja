import type { MatchProposalSummary } from '@/api/playIntents';

export function resolvePlayIntentProposal(
  liveProposal: MatchProposalSummary | null | undefined,
  deepLinkedProposal: MatchProposalSummary | null,
): MatchProposalSummary | null {
  if (liveProposal !== undefined) return liveProposal;
  return deepLinkedProposal ?? null;
}
