import { createContext, useContext } from 'react';
import type { MatchProposalSummary } from '@/api/playIntents';

/**
 * UI context surfaced by {@link PlayIntentProvider}. Kept in its own module so
 * that `PlayIntentFindBar.tsx` stays a component-only file (React Fast Refresh)
 * while still exposing a hook for sibling presentational consumers such as the
 * My-tab Play hero.
 */
export type PlayIntentCtx = {
  enabled: boolean;
  looking: boolean;
  isLoading: boolean;
  openCompose: () => void;
  openLobby: () => void;
  openProposal: () => void;
  stopLooking: () => void;
  proposal: MatchProposalSummary | null;
  whenLabel: string;
  idleWhenLabel: string;
  emptyPool: boolean;
  othersCount: number;
  stripMembers: {
    userId: string;
    firstName?: string | null;
    lastName?: string | null;
    avatar: string | null;
  }[];
  proposalArrivalToken: number;
};

export const PlayIntentUiContext = createContext<PlayIntentCtx | null>(null);

/**
 * Read the PlayIntent UI context. Must be called from a component mounted
 * beneath {@link PlayIntentProvider}.
 */
export function usePlayIntentContext(): PlayIntentCtx {
  const ctx = useContext(PlayIntentUiContext);
  if (!ctx) throw new Error('PlayIntent UI must be inside PlayIntentProvider');
  return ctx;
}
