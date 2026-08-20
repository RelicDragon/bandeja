export type SeqApplyDecision = {
  seq: number;
  applied: boolean;
};

/** Advance only through a contiguous prefix of applied seqs. */
export function nextAppliedCursor(
  previousCursor: number,
  decisions: readonly SeqApplyDecision[]
): number {
  let cursor = previousCursor;
  const ordered =
    decisions.length < 2 ? decisions : [...decisions].sort((a, b) => a.seq - b.seq);
  for (const decision of ordered) {
    if (decision.seq <= cursor) continue;
    if (!decision.applied) break;
    cursor = decision.seq;
  }
  return cursor;
}
