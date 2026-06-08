import type { BracketSlotDto } from '@/api/leagues';
import {
  buildBracketEditPositions,
  buildBracketSlotPatch,
  canSwapBracketPositions,
  swapBracketPositions,
} from '@/utils/bracketSlotEdit.util';
import { resolveEditTreeLayout } from './resolveEditTreeLayout';
import type { PlanBracketEditInput, PlanBracketEditResult } from './types';

export function planBracketEdit(input: PlanBracketEditInput): PlanBracketEditResult {
  if (input.mode === 'init') {
    const positions = buildBracketEditPositions(input.slots);
    return {
      treeLayout: resolveEditTreeLayout(positions),
      positions,
      validationErrors: [],
      payload: [],
    };
  }

  if (input.mode === 'swap') {
    const from = input.draft.find((p) => p.key === input.fromKey);
    const to = input.draft.find((p) => p.key === input.toKey);
    if (!from || !to || !canSwapBracketPositions(from, to)) {
      return {
        treeLayout: resolveEditTreeLayout(input.draft),
        positions: input.draft,
        validationErrors: ['invalidSwap'],
        payload: [],
      };
    }
    const nextDraft = swapBracketPositions(input.draft, input.pool, input.fromKey, input.toKey);
    return {
      treeLayout: resolveEditTreeLayout(nextDraft),
      positions: nextDraft,
      validationErrors: [],
      payload: [],
      nextDraft,
    };
  }

  const payload = buildBracketSlotPatch(input.baseline, input.draft);
  return {
    treeLayout: resolveEditTreeLayout(input.draft),
    positions: input.draft,
    validationErrors: payload.length === 0 ? ['nothingToSave'] : [],
    payload,
  };
}

export function buildEditParticipantPool(
  slots: BracketSlotDto[]
): Map<string, NonNullable<BracketSlotDto['participant']>> {
  const pool = new Map<string, NonNullable<BracketSlotDto['participant']>>();
  for (const s of slots) {
    const p = s.participant;
    if (!p?.id) continue;
    pool.set(p.id, p);
    if (s.leagueParticipantId) pool.set(s.leagueParticipantId, p);
  }
  return pool;
}
