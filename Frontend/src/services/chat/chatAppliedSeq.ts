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
  for (const decision of decisions) {
    if (decision.seq <= cursor) continue;
    if (!decision.applied) break;
    cursor = decision.seq;
  }
  return cursor;
}
