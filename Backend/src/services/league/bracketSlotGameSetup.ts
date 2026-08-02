import type { PlayoffGameSetupOverrides } from './gameCreation.util';

export const CROSS_GROUP_SLOT_SETUP_KEY = '__CROSS_GROUP__';

export type BracketSlotGameSetups = Record<
  string,
  Record<string, PlayoffGameSetupOverrides>
>;

export type BracketGameSetupConfig = {
  gameSetup?: PlayoffGameSetupOverrides;
  slotGameSetups?: BracketSlotGameSetups;
};

/**
 * Resolves an optional format override by stable bracket identity.
 *
 * Slot-specific fields are layered over the round-wide playoff defaults so a
 * final can use official scoring without changing semifinals or placement
 * matches that materialize from the same round later.
 */
export function resolveBracketSlotGameSetup(
  config: BracketGameSetupConfig | null | undefined,
  leagueGroupId: string | null,
  slotKey: string,
): PlayoffGameSetupOverrides | undefined {
  const defaultSetup = config?.gameSetup;
  const scopeKey = leagueGroupId ?? CROSS_GROUP_SLOT_SETUP_KEY;
  const slotSetup = config?.slotGameSetups?.[scopeKey]?.[slotKey];

  if (!slotSetup) return defaultSetup;
  return { ...defaultSetup, ...slotSetup };
}
