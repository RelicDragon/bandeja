import type { BracketPlan } from '@/utils/bracketStructure';
import { standardFirstRoundPairings } from '@/utils/bracketStructure';

export type BracketPreviewPosition = {
  key: string;
  seed: number;
  phase: 'play-in' | `main-${number}`;
  participantId: string;
};

export function previewPhaseForSeed(plan: BracketPlan, seed: number): BracketPreviewPosition['phase'] | null {
  if (seed < 1 || seed > plan.entrantCount) return null;

  if (plan.playInGameCount > 0) {
    if (seed <= plan.byeCount) return 'play-in';
    const inPlayIn = plan.playInMatchups.some((m) => m.seedA === seed || m.seedB === seed);
    return inPlayIn ? 'play-in' : null;
  }

  const pairs = standardFirstRoundPairings(plan.bracketSize);
  const inFirstMain = pairs.some(([a, b]) => a === seed || b === seed);
  return inFirstMain ? 'main-0' : null;
}

export function buildBracketPreviewPositions(plan: BracketPlan): BracketPreviewPosition[] {
  const out: BracketPreviewPosition[] = [];
  for (let seed = 1; seed <= plan.entrantCount; seed += 1) {
    const phase = previewPhaseForSeed(plan, seed);
    const participantId = plan.orderedParticipantIds[seed - 1];
    if (!phase || !participantId) continue;
    out.push({ key: `seed:${seed}`, seed, phase, participantId });
  }
  return out;
}

export function canSwapBracketPreviewPositions(
  a: BracketPreviewPosition,
  b: BracketPreviewPosition
): boolean {
  if (a.key === b.key) return false;
  if (!a.participantId || !b.participantId) return false;
  if (a.participantId === b.participantId) return false;
  return a.phase === b.phase;
}

export function swapBracketPreviewPositions(
  positions: BracketPreviewPosition[],
  keyA: string,
  keyB: string
): BracketPreviewPosition[] {
  const i = positions.findIndex((p) => p.key === keyA);
  const j = positions.findIndex((p) => p.key === keyB);
  if (i < 0 || j < 0) return positions;
  const a = positions[i];
  const b = positions[j];
  if (!canSwapBracketPreviewPositions(a, b)) return positions;

  const next = [...positions];
  next[i] = { ...a, participantId: b.participantId };
  next[j] = { ...b, participantId: a.participantId };
  return next;
}

export function orderedParticipantIdsFromPreview(
  baseline: string[],
  positions: BracketPreviewPosition[]
): string[] {
  const order = [...baseline];
  for (const pos of positions) {
    order[pos.seed - 1] = pos.participantId;
  }
  return order;
}

export function applyPreviewReorderToPlan(plan: BracketPlan, positions: BracketPreviewPosition[]): BracketPlan {
  const orderedParticipantIds = orderedParticipantIdsFromPreview(plan.orderedParticipantIds, positions);
  const playInMatchups = plan.playInMatchups.map((m) => ({
    ...m,
    participantAId: orderedParticipantIds[m.seedA - 1],
    participantBId: orderedParticipantIds[m.seedB - 1],
  }));
  return { ...plan, orderedParticipantIds, playInMatchups };
}
