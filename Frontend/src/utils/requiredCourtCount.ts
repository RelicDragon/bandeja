export function computeRequiredCourtCount(maxParticipants: number, playersPerMatch = 4): number {
  const playersPerCourt = playersPerMatch === 2 ? 2 : 4;
  return Math.max(1, Math.ceil(maxParticipants / playersPerCourt));
}

export function computeMaxSelectableCourts(
  maxParticipants: number,
  availableCourtCount: number,
  playersPerMatch = 4,
): number {
  if (availableCourtCount <= 0) return 0;
  return Math.min(computeRequiredCourtCount(maxParticipants, playersPerMatch), availableCourtCount);
}
