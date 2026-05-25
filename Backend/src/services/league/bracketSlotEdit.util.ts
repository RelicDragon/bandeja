import { BracketSlotKind, ResultsStatus } from '@prisma/client';

export type BracketSlotRow = {
  id: string;
  slotKind: BracketSlotKind;
  phaseIndex: number;
  roundIndex: number;
  leagueParticipantId: string | null;
  gameId: string | null;
  winnerSlotId: string | null;
  feederSlotAId: string | null;
  feederSlotBId: string | null;
  game?: { resultsStatus: ResultsStatus } | null;
};

export function slotsById(slots: BracketSlotRow[]): Map<string, BracketSlotRow> {
  return new Map(slots.map((s) => [s.id, s]));
}

export function playInPhaseHasFinal(slots: BracketSlotRow[]): boolean {
  return slots.some(
    (s) => s.slotKind === BracketSlotKind.PLAY_IN && s.game?.resultsStatus === ResultsStatus.FINAL
  );
}

export function playInPhaseComplete(slots: BracketSlotRow[]): boolean {
  const playIn = slots.filter((s) => s.slotKind === BracketSlotKind.PLAY_IN);
  if (playIn.length === 0) return true;
  return playIn.every(
    (s) => s.gameId != null && s.game?.resultsStatus === ResultsStatus.FINAL
  );
}

export function mainRoundHasFinal(slots: BracketSlotRow[], roundIndex: number): boolean {
  return slots.some(
    (s) =>
      s.slotKind === BracketSlotKind.MAIN &&
      s.roundIndex === roundIndex &&
      s.game?.resultsStatus === ResultsStatus.FINAL
  );
}

/** Slots fed by winner chain and feeder graph below `startSlotId`. */
export function collectDescendantSlotIds(
  startSlotId: string,
  byId: Map<string, BracketSlotRow>
): Set<string> {
  const out = new Set<string>();
  const queue: string[] = [startSlotId];
  const seen = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);

    const slot = byId.get(id);
    if (!slot) continue;

    if (slot.winnerSlotId && !out.has(slot.winnerSlotId)) {
      out.add(slot.winnerSlotId);
      queue.push(slot.winnerSlotId);
    }

    for (const s of byId.values()) {
      if (s.feederSlotAId === id || s.feederSlotBId === id) {
        if (!out.has(s.id)) {
          out.add(s.id);
          queue.push(s.id);
        }
      }
    }
  }

  return out;
}

export function hasBlockingDownstreamMainFinal(
  startSlotId: string,
  byId: Map<string, BracketSlotRow>
): boolean {
  for (const descId of collectDescendantSlotIds(startSlotId, byId)) {
    const s = byId.get(descId);
    if (
      (s?.slotKind === BracketSlotKind.MAIN ||
        s?.slotKind === BracketSlotKind.THIRD_PLACE ||
        s?.slotKind === BracketSlotKind.GRAND_FINAL) &&
      s.game?.resultsStatus === ResultsStatus.FINAL
    ) {
      return true;
    }
  }
  return false;
}

export function slotAcceptsParticipantAssignment(slot: BracketSlotRow): boolean {
  return slot.slotKind === BracketSlotKind.BYE;
}

export function slotAcceptsSideAssignment(slot: BracketSlotRow): boolean {
  return (
    (slot.slotKind === BracketSlotKind.PLAY_IN || slot.slotKind === BracketSlotKind.MAIN) &&
    slot.gameId != null
  );
}

export function assertEditablePhase(
  slot: BracketSlotRow,
  groupSlots: BracketSlotRow[]
): void {
  if (slot.slotKind === BracketSlotKind.PLAY_IN || slot.slotKind === BracketSlotKind.BYE) {
    if (playInPhaseHasFinal(groupSlots)) {
      throw new Error('PLAY_IN_PHASE_LOCKED');
    }
    return;
  }
  if (slot.slotKind === BracketSlotKind.MAIN) {
    if (mainRoundHasFinal(groupSlots, slot.roundIndex)) {
      throw new Error(`MAIN_ROUND_${slot.roundIndex}_LOCKED`);
    }
  }
}
