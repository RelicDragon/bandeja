import type { BracketPlayoffGroupDto } from '@/api/leagues';
import { isThirdPlaceSlot } from '@/utils/bracketThirdPlace.util';
import { buildBracketPodium } from '@/utils/leagueBracketOutcome';

export type BracketPodiumRowStatus = 'resolved' | 'in_progress';

export type BracketPodiumRowKind = 'champion' | 'finalist' | 'thirdPlace' | 'semifinalist';

export type BracketPodiumDisplayRow = {
  kind: BracketPodiumRowKind;
  participantId: string | null;
  status: BracketPodiumRowStatus;
  semifinalistIndex?: number;
};

export function groupHasThirdPlaceSlot(group: BracketPlayoffGroupDto): boolean {
  return group.slots.some(isThirdPlaceSlot);
}

export function buildBracketPodiumDisplayRows(group: BracketPlayoffGroupDto): BracketPodiumDisplayRow[] {
  const podium = buildBracketPodium(group);
  const hasAny =
    podium.championId ||
    podium.finalistId ||
    podium.thirdPlaceId ||
    podium.semifinalistIds.length > 0;
  if (!hasAny) return [];

  const rows: BracketPodiumDisplayRow[] = [];
  const hasThirdSlot = groupHasThirdPlaceSlot(group);

  if (podium.championId) {
    rows.push({ kind: 'champion', participantId: podium.championId, status: 'resolved' });
  } else if (podium.finalistId || podium.thirdPlaceId || podium.semifinalistIds.length > 0) {
    rows.push({ kind: 'champion', participantId: null, status: 'in_progress' });
  }

  if (podium.finalistId) {
    rows.push({ kind: 'finalist', participantId: podium.finalistId, status: 'resolved' });
  } else if (podium.championId || podium.thirdPlaceId || podium.semifinalistIds.length > 0) {
    rows.push({ kind: 'finalist', participantId: null, status: 'in_progress' });
  }

  if (podium.thirdPlaceId) {
    rows.push({ kind: 'thirdPlace', participantId: podium.thirdPlaceId, status: 'resolved' });
  } else if (
    hasThirdSlot &&
    (podium.championId || podium.finalistId || podium.semifinalistIds.length > 0)
  ) {
    rows.push({ kind: 'thirdPlace', participantId: null, status: 'in_progress' });
  }

  for (let i = 0; i < podium.semifinalistIds.length; i++) {
    rows.push({
      kind: 'semifinalist',
      participantId: podium.semifinalistIds[i],
      status: 'resolved',
      semifinalistIndex: i + 1,
    });
  }

  return rows;
}
