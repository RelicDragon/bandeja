export function computeRequiredCourtCount(maxParticipants: number): number {
  if (maxParticipants <= 4) return 1;
  return Math.ceil(maxParticipants / 4);
}

export function computeMaxSelectableCourts(
  maxParticipants: number,
  availableCourtCount: number,
): number {
  if (availableCourtCount <= 0) return 0;
  return Math.min(computeRequiredCourtCount(maxParticipants), availableCourtCount);
}
