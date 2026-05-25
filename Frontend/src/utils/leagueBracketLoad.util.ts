/** UX-D4: clear stale tree as soon as the selected bracket round changes. */
export function shouldClearBracketPayloadOnRoundChange(
  previousRoundId: string | null | undefined,
  nextRoundId: string | null | undefined
): boolean {
  if (!nextRoundId) return true;
  if (!previousRoundId) return false;
  return previousRoundId !== nextRoundId;
}

export type BracketRoundLoadUiState = {
  bracketPayload: unknown | null;
  bracketLoading: boolean;
  bracketError: boolean;
};

export function bracketRoundLoadUiOnRoundChange(
  prev: BracketRoundLoadUiState,
  previousRoundId: string | null | undefined,
  nextRoundId: string | null | undefined
): BracketRoundLoadUiState {
  if (!nextRoundId) {
    return { bracketPayload: null, bracketLoading: false, bracketError: false };
  }
  const clearPayload = shouldClearBracketPayloadOnRoundChange(previousRoundId, nextRoundId);
  return {
    bracketPayload: clearPayload ? null : prev.bracketPayload,
    bracketLoading: true,
    bracketError: false,
  };
}
