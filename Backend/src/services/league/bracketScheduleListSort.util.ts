import { BracketSlotKind } from '@prisma/client';

export type BracketGameSortMeta = {
  kind: 'PLAY_IN' | 'MAIN';
  roundIndex: number;
};

export function buildBracketGameSortMetaMap(
  slots: Array<{
    gameId: string | null;
    slotKind: BracketSlotKind;
    roundIndex: number;
  }>
): Map<string, BracketGameSortMeta> {
  const map = new Map<string, BracketGameSortMeta>();
  for (const slot of slots) {
    if (!slot.gameId) continue;
    if (slot.slotKind !== BracketSlotKind.PLAY_IN && slot.slotKind !== BracketSlotKind.MAIN) {
      continue;
    }
    map.set(slot.gameId, {
      kind: slot.slotKind,
      roundIndex: slot.roundIndex,
    });
  }
  return map;
}

function compareStartTime(
  a: { startTime: Date | string | null },
  b: { startTime: Date | string | null }
): number {
  const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
  const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
  return ta - tb;
}

export function sortBracketRoundGames<T extends { id: string; startTime: Date | string | null }>(
  games: T[],
  metaByGameId: Map<string, BracketGameSortMeta>
): T[] {
  if (metaByGameId.size === 0) return games;
  return [...games].sort((a, b) => {
    const ma = metaByGameId.get(a.id);
    const mb = metaByGameId.get(b.id);
    if (!ma && !mb) return compareStartTime(a, b);
    if (!ma) return 1;
    if (!mb) return -1;
    if (ma.kind !== mb.kind) return ma.kind === 'PLAY_IN' ? -1 : 1;
    if (ma.kind === 'MAIN' && mb.kind === 'MAIN' && ma.roundIndex !== mb.roundIndex) {
      return ma.roundIndex - mb.roundIndex;
    }
    return compareStartTime(a, b);
  });
}
