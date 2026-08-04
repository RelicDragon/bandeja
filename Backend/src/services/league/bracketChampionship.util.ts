import { BracketSlotKind, ResultsStatus } from '@prisma/client';
import { championshipResolvedByFirstGrandFinal } from './bracketDoubleElimination.util';

export type ChampionshipSlotLite = {
  id?: string;
  slotKind: BracketSlotKind | string;
  roundIndex: number;
  gameId: string | null;
  winnerSlotId: string | null;
  feederSlotAId?: string | null;
  game?: { resultsStatus: ResultsStatus | string } | null;
};

/**
 * Result of picking which bracket game (if any) defines champion + finalist.
 * Display, trophies, and season finalize MUST use this same selection order.
 */
export type ChampionshipGameSelection =
  | {
      kind: 'resolved_game';
      slot: ChampionshipSlotLite;
      gameId: string;
      source: 'legacy_grand_final' | 'grand_final_reset' | 'main_final';
    }
  | {
      /** Needs winners-bracket champion identity to confirm no reset is required. */
      kind: 'first_grand_final_candidate';
      slot: ChampionshipSlotLite;
      gameId: string;
      winnersFeederSlotId: string;
    }
  | { kind: 'unresolved' };

function isFinalStatus(status: ResultsStatus | string | null | undefined): boolean {
  return status === ResultsStatus.FINAL || status === 'FINAL';
}

function isKind(slot: ChampionshipSlotLite, kind: BracketSlotKind): boolean {
  return slot.slotKind === kind || slot.slotKind === (kind as string);
}

/**
 * Pure selection of the championship final game from a single tree's slots.
 * Order matches `BracketAdvancementService.resolveChampionshipFromSlots`.
 */
export function selectChampionshipGame(
  slots: readonly ChampionshipSlotLite[]
): ChampionshipGameSelection {
  const grandFinals = slots
    .filter((s) => isKind(s, BracketSlotKind.GRAND_FINAL))
    .sort((a, b) => b.roundIndex - a.roundIndex);

  const legacyGrandFinal = grandFinals.length === 1 ? grandFinals[0] : null;
  if (legacyGrandFinal?.gameId && isFinalStatus(legacyGrandFinal.game?.resultsStatus)) {
    return {
      kind: 'resolved_game',
      slot: legacyGrandFinal,
      gameId: legacyGrandFinal.gameId,
      source: 'legacy_grand_final',
    };
  }

  const completedReset = grandFinals.find(
    (s) => s.roundIndex > 0 && s.gameId && isFinalStatus(s.game?.resultsStatus)
  );
  if (completedReset?.gameId) {
    return {
      kind: 'resolved_game',
      slot: completedReset,
      gameId: completedReset.gameId,
      source: 'grand_final_reset',
    };
  }

  const firstGrandFinal = grandFinals.find((s) => s.roundIndex === 0);
  if (
    firstGrandFinal?.gameId &&
    isFinalStatus(firstGrandFinal.game?.resultsStatus) &&
    firstGrandFinal.feederSlotAId
  ) {
    return {
      kind: 'first_grand_final_candidate',
      slot: firstGrandFinal,
      gameId: firstGrandFinal.gameId,
      winnersFeederSlotId: firstGrandFinal.feederSlotAId,
    };
  }

  if (grandFinals.length > 0) {
    return { kind: 'unresolved' };
  }

  const mainFinal = slots.find(
    (s) => isKind(s, BracketSlotKind.MAIN) && s.winnerSlotId == null
  );
  if (mainFinal?.gameId && isFinalStatus(mainFinal.game?.resultsStatus)) {
    return {
      kind: 'resolved_game',
      slot: mainFinal,
      gameId: mainFinal.gameId,
      source: 'main_final',
    };
  }
  return { kind: 'unresolved' };
}

/**
 * Whether a tree's championship is decided (champion + finalist can be read from
 * the championship game). For first-grand-final candidates the caller must supply
 * whether the winners-bracket champion took that match (no reset needed).
 */
export function isChampionshipTreeDecided(
  slots: readonly ChampionshipSlotLite[],
  opts?: { firstGrandFinalResolvedByWinnersChampion?: boolean }
): boolean {
  const selection = selectChampionshipGame(slots);
  if (selection.kind === 'resolved_game') return true;
  if (selection.kind === 'first_grand_final_candidate') {
    return opts?.firstGrandFinalResolvedByWinnersChampion === true;
  }
  return false;
}

/**
 * True when the first grand final alone crowns a champion (winners side held).
 * False means a reset is still required or identities are incomplete.
 */
export function firstGrandFinalResolvesChampionship(params: {
  firstFinalWinnerId: string | null;
  winnersChampionId: string | null;
}): boolean {
  return championshipResolvedByFirstGrandFinal(params);
}

/**
 * Third-place is decisive only when that slot exists / is configured.
 */
export function isThirdPlaceTreeDecided(
  slots: readonly ChampionshipSlotLite[],
  includeThirdPlace: boolean
): boolean {
  if (!includeThirdPlace) return true;
  const third = slots.find((s) => isKind(s, BracketSlotKind.THIRD_PLACE));
  if (!third) return false;
  return !!third.gameId && isFinalStatus(third.game?.resultsStatus);
}

/**
 * Full tree ready for season podium / auto-finalize (championship + optional third).
 */
export function isBracketTreePodiumReady(
  slots: readonly ChampionshipSlotLite[],
  includeThirdPlace: boolean,
  opts?: { firstGrandFinalResolvedByWinnersChampion?: boolean }
): boolean {
  if (slots.length === 0) return false;
  return (
    isChampionshipTreeDecided(slots, opts) &&
    isThirdPlaceTreeDecided(slots, includeThirdPlace)
  );
}
