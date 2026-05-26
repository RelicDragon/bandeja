import { describe, expect, it } from 'vitest';
import { buildBracketPlan } from '@/utils/bracketStructure';
import {
  buildBracketPreviewPositions,
  canSwapBracketPreviewPositions,
  clearBracketPreviewPosition,
  orderedParticipantIdsFromPreview,
  swapBracketPreviewPositions,
  unassignedParticipantIdsFromPreview,
} from '@/utils/bracketPreviewReorder.util';

describe('bracketPreviewReorder.util', () => {
  it('allows swap within play-in phase only', () => {
    const plan = buildBracketPlan(5, ['p1', 'p2', 'p3', 'p4', 'p5']);
    const positions = buildBracketPreviewPositions(plan);
    const bye = positions.find((p) => p.seed === 1)!;
    const playInA = positions.find((p) => p.seed === 4)!;
    const playInB = positions.find((p) => p.seed === 5)!;

    expect(canSwapBracketPreviewPositions(bye, playInA)).toBe(true);
    expect(canSwapBracketPreviewPositions(playInA, playInB)).toBe(true);
  });

  it('swaps participant ids at seeds', () => {
    const plan = buildBracketPlan(5, ['p1', 'p2', 'p3', 'p4', 'p5']);
    const baseline = buildBracketPreviewPositions(plan);
    const playInA = baseline.find((p) => p.seed === 4)!;
    const playInB = baseline.find((p) => p.seed === 5)!;
    const next = swapBracketPreviewPositions(baseline, playInA.key, playInB.key);
    const order = orderedParticipantIdsFromPreview(plan.orderedParticipantIds, next);
    expect(order[3]).toBe('p5');
    expect(order[4]).toBe('p4');
  });

  it('allows swap within first main round when no play-in', () => {
    const plan = buildBracketPlan(8, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const positions = buildBracketPreviewPositions(plan);
    expect(positions.every((p) => p.phase === 'main-0')).toBe(true);
    expect(canSwapBracketPreviewPositions(positions[0], positions[1])).toBe(true);
  });

  it('clear moves participant to unassigned pool', () => {
    const plan = buildBracketPlan(8, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const positions = buildBracketPreviewPositions(plan);
    const cleared = clearBracketPreviewPosition(positions, positions[0].key);
    expect(cleared[0].participantId).toBeNull();
    expect(unassignedParticipantIdsFromPreview(plan.orderedParticipantIds, cleared)).toEqual(['a']);
    const order = orderedParticipantIdsFromPreview(plan.orderedParticipantIds, cleared);
    expect(order[0]).toBe('');
  });
});
