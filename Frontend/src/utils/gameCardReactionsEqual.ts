export type GameCardReactionRow = { userId: string; emoji: string };

export function gameCardReactionsEqual(
  a: readonly GameCardReactionRow[],
  b: readonly GameCardReactionRow[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].userId !== b[i].userId || a[i].emoji !== b[i].emoji) return false;
  }
  return true;
}
