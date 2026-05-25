import type { BracketEditPosition } from '@/utils/bracketSlotEdit.util';

export type BracketEditTreeColumn =
  | { kind: 'play-in'; pairs: Array<[BracketEditPosition, BracketEditPosition]> }
  | { kind: 'byes'; positions: BracketEditPosition[] }
  | { kind: 'main'; roundIndex: number; roundLabel: string; pairs: Array<[BracketEditPosition, BracketEditPosition]> };

function pairMainPositions(positions: BracketEditPosition[]): Array<[BracketEditPosition, BracketEditPosition]> {
  const bySlot = new Map<string, BracketEditPosition[]>();
  for (const p of positions) {
    const list = bySlot.get(p.slotId) ?? [];
    list.push(p);
    bySlot.set(p.slotId, list);
  }
  const pairs: Array<[BracketEditPosition, BracketEditPosition]> = [];
  for (const list of bySlot.values()) {
    const a = list.find((p) => p.side === 'A');
    const b = list.find((p) => p.side === 'B');
    if (a && b) pairs.push([a, b]);
  }
  return pairs;
}

function pairPlayInPositions(positions: BracketEditPosition[]): Array<[BracketEditPosition, BracketEditPosition]> {
  const playIn = positions.filter((p) => p.slotKind === 'PLAY_IN');
  return pairMainPositions(playIn);
}

export function buildBracketEditTreeColumns(positions: BracketEditPosition[]): BracketEditTreeColumn[] {
  const columns: BracketEditTreeColumn[] = [];

  const playInPairs = pairPlayInPositions(positions);
  if (playInPairs.length > 0) {
    columns.push({ kind: 'play-in', pairs: playInPairs });
  }

  const byePositions = positions
    .filter((p) => p.slotKind === 'BYE')
    .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
  if (byePositions.length > 0) {
    columns.push({ kind: 'byes', positions: byePositions });
  }

  const mainByRound = new Map<number, BracketEditPosition[]>();
  for (const p of positions.filter((x) => x.slotKind === 'MAIN')) {
    const list = mainByRound.get(p.roundIndex) ?? [];
    list.push(p);
    mainByRound.set(p.roundIndex, list);
  }

  for (const roundIndex of [...mainByRound.keys()].sort((a, b) => a - b)) {
    const roundPositions = mainByRound.get(roundIndex) ?? [];
    columns.push({
      kind: 'main',
      roundIndex,
      roundLabel: roundPositions[0]?.roundLabel ?? `R${roundIndex + 1}`,
      pairs: pairMainPositions(roundPositions),
    });
  }

  return columns;
}
