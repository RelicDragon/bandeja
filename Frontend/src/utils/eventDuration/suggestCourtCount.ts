export const MAX_EVENT_COURTS = 4;

export function idealCourtCount(maxParticipants: number, playersPerMatch: 2 | 4): number {
  if (maxParticipants <= playersPerMatch) return 1;
  return Math.max(1, Math.floor(maxParticipants / playersPerMatch));
}

/** UI + duration default when ≥8 players; capped at {@link MAX_EVENT_COURTS}. */
export function suggestCourtCountForParticipants(
  maxParticipants: number,
  playersPerMatch: 2 | 4,
): number | null {
  if (maxParticipants < 8) return null;
  return Math.min(MAX_EVENT_COURTS, idealCourtCount(maxParticipants, playersPerMatch));
}

export function effectiveCourtCountForEstimate(
  maxParticipants: number,
  playersPerMatch: 2 | 4,
  selectedCourtCount: number,
): number {
  const ideal = idealCourtCount(maxParticipants, playersPerMatch);
  const capped = Math.min(MAX_EVENT_COURTS, ideal);
  if (selectedCourtCount > 0) return Math.min(selectedCourtCount, capped);
  return capped;
}
